import { Fragment, useContext, useEffect, useState } from 'react';
import { apiPost, useEventListener } from '../util';
import { MainTableContext, prettyTable, shortTable, useEventsSettings } from './events';
import { color } from '../plots/plotUtil';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { AuthContext, logError, logSuccess } from '../app';
import { useMutation, useQueryClient } from 'react-query';

const EXTREMUM_OP = ['min', 'max', 'abs_min', 'abs_max'] as const;
const G_COMBINE_OP = ['diff', 'abs_diff'] as const;
const G_VALUE_OP = ['time_offset', 'time_offset_%', ...EXTREMUM_OP, 'mean', 'median', 'range', 'coverage'] as const;
const G_ALL_OPS = [...G_VALUE_OP, ...G_COMBINE_OP, 'clone_column'];

type RefPointExtremum = {
	type: 'extremum',
	hours_offset: number,
	operation: typeof EXTREMUM_OP[number],
	series: string,
};
type RefPointEvent = {
	type: 'event',
	hours_offset: number,
	entity_offset: number,
	entity: string,
	end?: boolean,
};
type ReferencePoint = RefPointExtremum | RefPointEvent;
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
	series?: string // if not time_offset
};
type GenericParams = GenericParamsClone | GenericParamsCombine | GenericParamsValue;
type GenericParamsOptions = { operation: typeof G_ALL_OPS[number] } & Omit<GenericParamsClone, 'operation'>
& Omit<GenericParamsCombine, 'operation'> & Omit<GenericParamsValue, 'operation'>;

export type GenericColumn = {
	id: number,
	entity: string,
	is_public: boolean,
	is_own: boolean,
	nickname: string | null,
	description: string | null,
	params: GenericParams,
};

type GenericState = Partial<Omit<GenericColumn, 'params'>> & {
	params: Partial<GenericParamsOptions>,
	setGeneric: (g: GenericColumn) => void,
	set: <K extends keyof GenericState>(k: K, val: GenericState[K]) => void,
	setParam: <K extends keyof GenericParamsOptions>(k: K, val?: GenericParamsOptions[K]) => void,
	setPoint: (k: 'reference'|'boundary', val: string) => void,
	setPointHours: (k: 'reference'|'boundary', val: number) => void,
	setPointSeries: (k: 'reference'|'boundary', val: string) => void,
};
const defaultRefPoint = { type: 'event', entity: 'forbush_effects', hours_offset: 0, entity_offset: 0 } as const as RefPointEvent;

const defaultState = { entity: defaultRefPoint.entity, params: {} };
const useGenericState = create<GenericState>()(immer(set => ({
	...defaultState,
	setGeneric: g => set(state => { Object.assign(state, g); }),
	set: (k, val) => set(state => { state[k] = val; }),
	setParam: (k, val) => set((state) => {
		let inp = state.params;
		if (k === 'operation') {
			const type = (op?: any) => op === 'clone_column' ? 'clone'
				: op?.startsWith('time_offset') ? 'time': G_VALUE_OP.includes(op) ? 'value' : 'combine';
			const typeChanged = type(inp?.operation) !== type(val);
			state.params = inp = { ...(!typeChanged && inp), [k]: val };
			if (typeChanged && val === 'clone_column')
				inp.entity_offset = 0;
			if (typeChanged && G_VALUE_OP.includes(val as any)) {
				inp.reference = { ...defaultRefPoint };
				inp.boundary = { ...inp.reference, end: true };
			}
		} else  {
			inp[k] = val;
		}
	}),
	setPoint: (k, val) => set(({ params }) => {
		const type = EXTREMUM_OP.includes(val as any) ? 'extremum' : 'event';
		const inp = params[k];
		const hours_offset = inp?.hours_offset ?? 0;
		if (type === 'extremum') {
			const series = inp?.type === 'extremum' ? inp.series : 'min';
			params[k] = { type, operation: val as any, hours_offset, series } ;
		} else {
			const entity = val.split('+').at(-1)!;
			const end = val.includes('end+');
			const entity_offset = val.includes('prev+') ? -1 :  val.includes('next+') ? 1 : 0;
			params[k] = { type, entity, entity_offset, hours_offset, end };
		}
	}),
	setPointHours: (k, val) => set(({ params: { [k]: point } }) => { if (point) point.hours_offset = val; }),
	setPointSeries: (k, val) => set(({ params: { [k]: point } }) => { if (point?.type === 'extremum') point.series = val; }),
})));

const refToStr = (ref: Partial<Extract<ReferencePoint, { type: 'event' }>>, pretty?: boolean) =>
	(pretty?['Prev ', '', 'Next ']:['prev+', '', 'next+'])[(ref?.entity_offset??0)+1] +
	(pretty ? (shortTable(ref.entity??'') + (ref.end == null ? '' : ref.end ? ' End' : ' Start')) : ((ref.end ? 'end+' : '') + ref.entity));

export default function ColumnsSelector() {
	const queryClient = useQueryClient();
	const { role } = useContext(AuthContext);
	const { shownColumns, setColumns } = useEventsSettings();
	const { tables: allTables, columns, series: seriesOpts } = useContext(MainTableContext);
	const [action, setAction] = useState(true);
	const [open, setOpen] = useState(false);
	const [report, setReport] = useState<{ error?: string, success?: string }>({});
	const genericSate = useGenericState();
	const { params, entity, id: gid, nickname, description: desc, setGeneric, set, setParam,
		setPoint, setPointHours, setPointSeries } = genericSate;
	const { operation } = params;

	useEffect(() => {
		if (!report.error && !report.success) return;
		const timeout = setTimeout(() => setReport({}), 10_000);
		return () => clearTimeout(timeout);
	}, [report]);

	const oriColumn = gid == null ? null : columns.find(c => c.generic?.id === gid);
	const original = oriColumn && oriColumn.generic;
	const paramsChanged = original && (entity !== original.entity || JSON.stringify(original.params) !== JSON.stringify(params));
	const smhChanged = original && (paramsChanged || desc !== original.description || nickname !== original.nickname);
	const tables = allTables.filter(t => columns.find(c => c.table === t && c.name === 'time'));
	const withDuration = tables.filter(t => columns.find(c => c.table === t && c.name === 'duration'));
	const isClone = operation === 'clone_column', isCombine = G_COMBINE_OP.includes(operation as any), isValue = G_VALUE_OP.includes(operation as any);
	const isTime = operation?.startsWith('time_offset');
	const isValid = (isClone && params.column) || (isCombine && params.column && params.other_column) || (isValue && (params.series || isTime));
	const columnOpts = (!isClone && !isCombine) ? null : columns
		.filter(c => !c.hidden).map(({ id, fullName }) => [id, fullName]);

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openColumnsSelector', () => setOpen(o => !o));
	const check = (id: string, val: boolean) =>
		setColumns(cols => val ? cols.concat(id) : cols.filter(c => c !== id));

	const { mutate: computeGeneric } = useMutation((genericId: number) =>
		apiPost<{ time: number }>('events/generics/compute', { id: genericId })
	, { onSuccess: ({ time }, genericId) => {
		const col = columns.find(c => c.generic?.id === genericId);
		queryClient.invalidateQueries('tableData');
		setReport({ success: `Done in ${time} s` });
		logSuccess(`Computed ${col?.fullName ?? genericId} in ${time} s`);
	}, onError: (err: any, genericId) => {
		const col = columns.find(c => c.generic?.id === genericId);
		setReport({ error: err.toString() });
		logError(`compute g#${genericId}(${col?.fullName}): ` + err.toString());
	} });
	useEventListener('computeGeneric', (e: CustomEvent<{ id: number }>) =>
		computeGeneric(e.detail.id));

	const { mutate: deleteGeneric } = useMutation((genericId: number) =>
		apiPost<{ time: number }>('events/generics/remove', { id: genericId })
	, { onSuccess: ({ time }, genericId) => {
		if (genericId === gid)
			useGenericState.setState({ ...defaultState });
		const col = columns.find(c => c.generic?.id === genericId);
		queryClient.invalidateQueries('tableStructure');
		logSuccess(`Deleted column ${col?.fullName ?? genericId}`);
	}, onError: (err: any, genericId) => {
		const col = columns.find(c => c.generic?.id === genericId);
		logError(`delete g#${genericId}(${col?.fullName}): ` + err.toString());
	} });

	const { mutate: mutateGeneric } = useMutation((createNew: boolean) =>
		apiPost<{ generic: GenericColumn, time: number }>('events/generics', {
			...genericSate, gid: createNew ? undefined : gid })
	, { onSuccess: ({ generic, time }) => {
		queryClient.invalidateQueries('tableStructure');
		queryClient.invalidateQueries('tableData');
		setGeneric(generic);
		setReport({ success: 'Done!' });
		logSuccess((gid?'Modified':'Created') + ' generic ' + (oriColumn?.fullName ?? generic.nickname ?? generic.id));
	}, onError: (err: any) => {
		setReport({ error: err.toString() });
		logError('generic: ' + err.toString());
	} });
	
	const Select = <T extends GenericParams>({ txt, k, opts }:
	{ txt: string, k: T extends T ? keyof T : never, opts: string[][] }) =>
		<div>{txt}:<select className='Borderless' style={!opts.find(o => o[0] === (params as T)[k]) ? { color: color('text-dark') } : {}} 
			value={(params as T)[k] as any || 'null'}
			onChange={e => setParam(k, e.target.value === 'null' ? undefined : e.target.value as any)}>
			<option value='null'>-- None --</option>
			{opts.map(([val, pretty]) => <option key={val} value={val}>{pretty}</option>)}
		</select></div>;
	const RefInput = ({ k }: { k: 'boundary'|'reference' }) => {
		const st = params[k];
		const isEvent = st?.type === 'event';
		const isDefault = isEvent && !(Object.keys(defaultRefPoint) as (keyof RefPointEvent)[])
			.some((p) => st[p] !== defaultRefPoint[p]) && st.end !== (k === 'reference' ? true : false);
		return <>
			<select style={{ color: isDefault ? color('text-dark') : 'unset',
				width: isEvent ? '16ch' : '7.5ch' }} className='Borderless'
			value={isEvent ? refToStr(st) : st?.operation} onChange={e => setPoint(k, e.target.value)}>
				<option value='null' disabled>-- None --</option>
				{EXTREMUM_OP.map(ext => <option key={ext} value={ext}>{ext.startsWith('abs_') ? `|${ext.slice(4)}|` : ext}</option>)}
				{tables.flatMap((ent, i) => (i > 0 ? [0] : [0, -1, 1]).flatMap(entity_offset => 
					(i === 0 || withDuration.includes(ent) ? [false, true] : [undefined])
						.map(end => [false, true].map(p => refToStr({ entity: ent, entity_offset, end }, p)))))
					.map(([str, pretty]) => <option key={str} value={str}>{pretty}</option>)}
			</select>
			{st?.type === 'extremum' && <select className='Borderless' style={{ width: '10ch' }}
				value={st.series} onChange={e => setPointSeries(k, e.target.value)}>
				{Object.entries(seriesOpts).map(([ser, pretty]) => <option key={ser} value={ser}>{pretty}</option>)}
			</select>}
			<label title='Offset in hours' style={{ paddingLeft: 2, color: st?.hours_offset === 0 ? color('text-dark') : 'inherit' }}>
				+<input style={{ margin: '0 2px', width: '6ch' }} type='number' min={-48} max={48} step={1}
					value={st?.hours_offset??0} onChange={e => setPointHours(k, e.target.valueAsNumber)}/>h</label>
		</>;
	};
	return !open ? null : <>
		<div className='PopupBackground' onClick={() => setOpen(false)}
			onContextMenu={e => { setOpen(false); e.stopPropagation(); e.preventDefault(); }}/>
		<div className='Popup ColumnsSelector' onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
			{tables.map(table => <Fragment key={table}>
				<button className='TextButton' onClick={() => setColumns(cols => [
					...cols.filter(c => columns.find(cc => cc.id === c)?.table !== table),
					...(!columns.find(cc => cc.table === table && cols.includes(cc.id)) ? columns.filter(c => c.table === table).map(c => c.id) : [])])}>
					<b><u>{prettyTable(table)}</u></b></button>
				{columns.filter(c => !c.hidden && c.table === table).map(({ id, name, description, generic }) =>
					<div key={id} style={{ color: generic ? color('text-dark') : color('text'), cursor: 'pointer' }} title={description}>
						<button className='TextButton' style={{ flex: 1, textAlign: 'left', lineHeight: '1.1em' }}
							onMouseEnter={e => e.buttons === 1 && check(id, action)}
							onMouseDown={e => { if (e.button !== 0) return generic && setGeneric(generic);
								const chk = !shownColumns.includes(id); setAction(chk); check(id, chk); }}>
							<input type='checkbox' style={{ marginRight: 8 }} checked={!!shownColumns.includes(id)} readOnly/>{name}</button>
						{generic && <button style={{ fontSize: 16, height: 16, lineHeight: '16px', margin: '0 2px 4px 2px' }}
							title='Edit or clone column (RMB)' className='TextButton' onClick={() => setGeneric(generic)}>e</button>}
						{generic && <div className='CloseButton' onClick={() => deleteGeneric(generic.id)}/>}
					</div>)}
			</Fragment>)}
			{role && <div className='GenericsControls'>
				<h4 style={{ margin: 0, padding: '4px 2em 8px 0' }}>Create custom column</h4>
				{(original || isValid) && <label title='Display name for the column (optional)'>Name:
					<input type='text' style={{ width: '11em', marginLeft: 4 }} placeholder={oriColumn?.fullName}
						value={nickname ?? ''} onChange={e => set('nickname', e.target.value)}/></label>}
				{(original || isValid) && <label title='Column description (optional)' style={{ paddingBottom: 4 }}>Desc:
					<input type='text' style={{ width: '11em', marginLeft: 4 }} placeholder={oriColumn?.description}
						value={desc ?? ''} onChange={e => set('description', e.target.value)}/></label>}
				<div style={entity === defaultRefPoint.entity ? { color: color('text-dark') } : {}}>Entity:
					<select className='Borderless' value={entity} onChange={e => set('entity', e.target.value)}>
						{withDuration.map(tbl => <option key={tbl} value={tbl}>{prettyTable(tbl)}</option>)}
					</select></div>
				<Select txt='Type' k='operation' opts={G_ALL_OPS.map(t => [t, t])}/>
				{(isClone || isCombine) && <Select txt='Column' k='column' opts={columnOpts!}/>}
				{isCombine && <Select txt='Column' k='other_column' opts={columnOpts!}/>}
				{isClone && <label>Offset, events:
					<input style={{ width: 48, margin: '0 4px' }} type='number' step={1} min={-2} max={2}
						value={params.entity_offset} onChange={e => setParam('entity_offset', e.target.valueAsNumber)}/></label>}
				{isValue && <>
					{!isTime && <Select txt='Series' k='series' opts={Object.entries(seriesOpts)}/>}
					<div style={{ minWidth: 278, paddingTop: 4 }}>From<RefInput k='reference'/></div>
					<div style={{ minWidth: 278 }}>To<RefInput k='boundary'/></div>
				</>}
				<div style={{ height: 2 }}/>
				{(oriColumn && !paramsChanged) && <div style={{ paddingLeft: '5em', wordBreak: 'break-word' }}><button style={{ width: '14em' }}
					onClick={() => computeGeneric(oriColumn.generic!.id)}>Compute {oriColumn.fullName}</button></div>}
				{smhChanged && <div style={{ paddingLeft: '5em', wordBreak: 'break-word' }}><button style={{ width: '14em' }}
					onClick={() => mutateGeneric(false)}>Modify {oriColumn.fullName}</button></div>}
				{(!original || (paramsChanged && nickname !== original.nickname)) && isValid &&
					<div style={{ paddingLeft: '5em' }}><button style={{ width: '14em' }}
						onClick={() => mutateGeneric(true)}>Create {original ? 'new' : ''} column</button></div>}
				{report.error && <div style={{ color: color('red'), paddingLeft: 8, justifyContent: 'left', paddingTop: 4 }}
					onClick={()=>setReport({})}>{report.error}</div>}
				{report.success && <div style={{ color: color('green'), paddingLeft: 8, justifyContent: 'left', paddingTop: 4 }}
					onClick={()=>setReport({})}>{report.success}</div>}
			</div>}
			<div className='CloseButton' style={{ position: 'absolute', top: 2, right: 4 }} onClick={() => setOpen(false)}/>
		</div>
	</>;
}