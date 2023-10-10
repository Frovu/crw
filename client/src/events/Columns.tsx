import { Fragment, useContext, useState } from 'react';
import { useEventListener } from '../util';
import { MainTableContext, prettyTable, useEventsSettings } from './events';
import { color } from '../plots/plotUtil';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const EXTREMUM_OP = ['min', 'max', 'abs_min', 'abs_max'] as const;
const G_COMBINE_OP = ['diff', 'abs_diff'] as const;
const G_VALUE_OP = ['time_offset', 'time_offset_%', ...EXTREMUM_OP, 'mean', 'median', 'range', 'coverage'] as const;
const G_ALL_OPS = [...G_VALUE_OP, ...G_COMBINE_OP, 'clone_column'];

type ReferencePoint = {
	type: 'extremum',
	offset_hours: number,
	operation: typeof EXTREMUM_OP[number],
	series: string,
} | {
	type: 'event',
	offset_hours: number,
	offset_events: number,
	event: string,
	end?: boolean,
};
type GenericParamsClone = {
	operation: 'clone_column',
	column: string,
	entity_offset: number,
};
type GenericParamsCombine = {
	operation: typeof G_COMBINE_OP[number],
	column: string,
	other_column: string,
};
type GenericParamsValue = {
	operation: typeof G_VALUE_OP[number],
	reference: ReferencePoint,
	boundary: ReferencePoint,
	series: string
};
type GenericParams = GenericParamsClone | GenericParamsCombine | GenericParamsValue;
type GenericParamsOptions = { operation: typeof G_ALL_OPS[number] } & Omit<GenericParamsClone, 'operation'>
& Omit<GenericParamsCombine, 'operation'> & Omit<GenericParamsValue, 'operation'>;

export type GenericColumn = {
	id: number,
	params: GenericParams
};

type GenericsState = {
	id: number | null,
	inputState: Partial<GenericParamsOptions>,
	nicknames: { [gid: string]: string },
	setGeneric: (g: GenericColumn) => void,
	set: <K extends keyof GenericParamsOptions>(k: K, val?: GenericParamsOptions[K]) => void,
};
const useGenericsState = create<GenericsState>()(persist(immer(set => ({
	id: null,
	inputState: {},
	nicknames: {},
	setGeneric: g => set(state => { state.id = g.id; state.inputState = g.params; }),
	set: (k, val) => set((state) => {
		const inp = state.inputState;
		if (k === 'operation') {
			state.inputState = { [k]: val };
			if (val === 'clone_column')
				state.inputState.entity_offset = 0;
			return;
		}
		inp[k] = val;
	}),
})), {
	name: 'feidGenericColumns',
	partialize: ({ nicknames }) => ({ nicknames })
}));

export default function ColumnsSelector() {
	const { shownColumns, setColumns } = useEventsSettings();
	const { tables: allTables, columns, series: seriesOpts } = useContext(MainTableContext);
	const [action, setAction] = useState(true);
	const [open, setOpen] = useState(false);
	const { inputState, id: gid, setGeneric, set } = useGenericsState();
	const { operation } = inputState as GenericParams;

	const tables = allTables.filter(t => columns.find(c => c.table === t && c.name === 'time'));
	const isClone = operation === 'clone_column', isCombine = G_COMBINE_OP.includes(operation as any);
	const columnOpts = (!isClone && !isCombine) ? null : columns
		.filter(c => !c.hidden).map(({ id, fullName }) => [id, fullName]);
	const entShort = (ent: string) => prettyTable(ent).replace(/([A-Z])[a-z ]+/g, '$1');

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openColumnsSelector', () => setOpen(o => !o));
	const check = (id: string, val: boolean) =>
		setColumns(cols => val ? cols.concat(id) : cols.filter(c => c !== id));
	
	const Select = <T extends GenericParams>({ txt, k, opts, required }:
	{ txt: string, k: T extends T ? keyof T : never, opts: string[][], required?: boolean }) =>
		<div>{txt}:<select className='Borderless' style={!opts.find(o => o[0] === (inputState as T)[k]) ? { color: color('text-dark') } : {}} 
			value={(inputState as T)[k] as any || 'null'}
			onChange={e => set(k, e.target.value === 'null' ? undefined : e.target.value as any)}>
			{!required && <option value='null'>-- None --</option>}
			{opts.map(([val, pretty]) => <option key={val} value={val}>{pretty}</option>)}
		</select></div>;
	const RefInput = ({ which }: { which:'boundary'|'operation' }) => {
		return <select></select>
	}
	return !open ? null : <>
		<div className='PopupBackground' onClick={() => setOpen(false)}/>
		<div className='Popup ColumnsSelector'>
			{tables.map(table => <Fragment key={table}>
				<button className='TextButton' onClick={() => setColumns(cols => [
					...cols.filter(c => columns.find(cc => cc.id === c)?.table !== table),
					...(!columns.find(cc => cc.table === table && cols.includes(cc.id)) ? columns.filter(c => c.table === table).map(c => c.id) : [])])}>
					<b><u>{prettyTable(table)}</u></b></button>
				{columns.filter(c => !c.hidden && c.table === table).map(({ id, name, description, generic }) =>
					<div key={id} style={{ color: generic ? color('text-dark') : color('text'), cursor: 'pointer' }} title={description}>
						<button className='TextButton' style={{ flex: 1, textAlign: 'left', lineHeight: '1.1em' }}
							onMouseEnter={e => e.buttons === 1 && check(id, action)}
							onMouseDown={() => { const chk = !shownColumns.includes(id); setAction(chk); check(id, chk); }}>
							<input type='checkbox' style={{ marginRight: 8 }} checked={!!shownColumns.includes(id)} readOnly/>{name}</button>
						{generic && <button style={{ fontSize: 18, height: 16, lineHeight: '16px', margin: '0 2px 4px 2px' }}
							title='Copy parameters' className='TextButton' onClick={() => setGeneric(generic)}>c</button>}
						{generic && <div className='CloseButton' onClick={() => ({a:1111111111111})}/>}
					</div>)}
			</Fragment>)}
			<div className='GenericsControls' style={{ }}>
				<b>Create custom column</b>
				<Select txt='Type' k='operation' opts={G_ALL_OPS.map(t => [t, t])}/>
				{(isClone || isCombine) && <Select txt='Column' k='column' opts={columnOpts!}/>}
				{isCombine && <Select txt='Column' k='other_column' opts={columnOpts!}/>}
				{isClone && <label>Offset, events:
					<input style={{ width: 48, margin: '0 4px' }} type='number' step={1}
						value={inputState.entity_offset} onChange={e => set('entity_offset', 2)}/></label>}
				{G_VALUE_OP.includes(operation as any) && <>
					<Select txt='Series' k='series' opts={Object.entries(seriesOpts)}/>
				</>}
			</div>
			<div className='CloseButton' style={{ position: 'absolute', top: 2, right: 4 }} onClick={() => setOpen(false)}/>
		</div>
	</>;
}