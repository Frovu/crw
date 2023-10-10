import { Fragment, useContext, useState } from 'react';
import { useEventListener } from '../util';
import { MainTableContext, prettyTable, useEventsSettings } from './events';
import { color } from '../plots/plotUtil';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const G_TYPES = ['interval_value', 'local_value', 'combine_columns', 'clone_column'] as const;
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
type GenericColumnParams<T extends typeof G_TYPES[number]> = {
	type: T,
	column: T extends 'clone_columns'|'combine_columns' ? string : never,
	clone_entity_shift: T extends 'clone_columns' ? number : never,
	other_column: T extends 'combine_columns' ? string : never,
	combine: T extends 'combine_columns' ? typeof G_COMBINE_OP[number] : never,
	reference: T extends 'interval_value'|'local_value' ? ReferencePoint : never,
	boundary: T extends 'interval_value' ? ReferencePoint : undefined,
	operation: T extends 'interval_value'|'local_value' ? typeof G_VALUE_OP[number] : never,
	series: T extends 'interval_value'|'local_value' ? string : never
};
type AnyGenericParams = GenericColumnParams<typeof G_TYPES[number]>;
export type GenericColumn = {
	id: number,
	params: AnyGenericParams
};

type GenericsState = {
	id: number | null,
	inputState: Partial<AnyGenericParams>,
	nicknames: { [gid: string]: string },
	setGeneric: (g: GenericColumn) => void,
	set: <K extends keyof AnyGenericParams>(k: K, val?: AnyGenericParams[K]) => void,
};
const useGenericsState = create<GenericsState>()(persist(immer(set => ({
	id: null,
	inputState: {},
	nicknames: {},
	setGeneric: g => set(state => { state.id = g.id; state.inputState = g.params; }),
	set: (k, val) => set(state => { state.inputState[k] = val; }),
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
	const { type: gtype, column, clone_entity_shift, other_column, combine,
		reference } = inputState;

	const tables = allTables.filter(t => columns.find(c => c.table === t && c.name === 'time'));
	const isClone = gtype === 'clone_column', isDiff = gtype?.startsWith('diff'), isTime = gtype?.startsWith('time');
	const isSeriesColumn = isClone || isDiff;
	const columnOpts = !isSeriesColumn ? null : columns
		.filter(c => !c.hidden).map(({ id, fullName }) => [id, fullName]);
	const entShort = (ent: string) => prettyTable(ent).replace(/([A-Z])[a-z ]+/g, '$1');

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openColumnsSelector', () => setOpen(o => !o));
	const check = (id: string, val: boolean) =>
		setColumns(cols => val ? cols.concat(id) : cols.filter(c => c !== id));
	
	const Select = ({ txt, k, opts, required }: { txt: string, k: keyof typeof inputState, opts: string[][], required?: boolean }) =>
		<div>{txt}:<select className='Borderless' style={!opts.find(o => o[0] === inputState[k]) ? { color: color('text-dark') } : {}} 
			value={inputState[k] || 'null'}
			onChange={e => set(k, e.target.value === 'null' ? undefined : e.target.value)}>
			{!required && <option value='null'>{k === 'poi' ? 'default' : '-- None --'}</option>}
			{opts.map(([val, pretty]) => <option key={val} value={val}>{pretty}</option>)}
		</select></div>;
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
				<Select txt='Type' k='type' opts={TYPE_OPTIONS.map(t => [t, t])}/>
				{gtype && !isTime && !isSeriesColumn &&
					<Select txt='Series' k='series' opts={Object.entries(seriesOpts)}/>}
				{isSeriesColumn && <Select txt='Column' k='series' opts={columnOpts!}/>}
				{(series || isTime) && gtype && !isClone && <Select txt='POI' k='poi' opts={[['extremum', '<Extremum>']].concat(
					tables.flatMap(tbl => [[tbl, prettyTable(tbl).slice(0, -1)],
						...(columns.find(c => c.name === 'duration' && c.table === tbl) ?
							[['end_'+tbl, entShort(tbl)+' End']] : [])]))}/>}
				{poi === 'extremum' && <Select txt='Extrem' k='poi' opts={EXTREMUM_OP.map(e => [e, e])}/>}
				{poi === 'extremum' && <Select txt='of' k='poi' opts={Object.entries(seriesOpts)}/>}
				{gtype && isClone && <Select txt='Column' k='poi' opts={columnOpts!}/>}
				{poi && !isDiff && gtype && <label>Offset, {!isTime && !isSeriesColumn ? 'hours' : 'events'}:
					<input style={{ width: 48, margin: '0 4px' }} type='number' step={1}
						value={shift} onChange={e => set('shift', e.target.valueAsNumber)}/></label>}
			</div>
			<div className='CloseButton' style={{ position: 'absolute', top: 2, right: 4 }} onClick={() => setOpen(false)}/>
		</div>
	</>;
}