import { useContext, useState } from 'react';
import { useQueryClient } from 'react-query';
import { useMutationHandler } from '../util';
import { ColumnDef, prettyTable, SettingsContext, TableContext } from './Table';
import { MenuInput, MenuSelect } from './TableMenu';

const EXTREMUM_OPTIONS = ['min', 'max', 'abs_min', 'abs_max'] as const;
const TYPE_OPTIONS = ['value', 'time_to', 'time_to_%', ...EXTREMUM_OPTIONS, 'coverage'] as const;

function GenericCard({ column }: { column: ColumnDef }) {
	const queryClient = useQueryClient();
	const { set: setSetting } = useContext(SettingsContext);
	const { mutate, report, color, isLoading } = useMutationHandler(async (action) => {
		const res = await fetch(`${process.env.REACT_APP_API}api/events/generics/${action}`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: column.user_generic_id })
		});
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.text();
	});
	return (
		<div style={{ height: '3em', minWidth: '11em', whiteSpace: 'nowrap', marginLeft: '2em' }}>
			{column.name}
			<span className='CloseButton' style={{ margin: '4px 0 0 8px', transform: 'translateY(-3px)', color: 'var(--color-green)', fontSize: 21 }}
				onClick={()=>mutate('compute', {
					onSuccess: () => {
						queryClient.invalidateQueries('tableData');
						setSetting('enabledColumns', (cols) => cols.includes(column.id) ? cols : [...cols, column.id]);
					}
				})}>
				o
			</span>
			<span className='CloseButton' style={{ margin: '4px 0 0 6px', transform: 'none' }} onClick={()=>mutate('remove', {
				onSuccess: () => {
					queryClient.invalidateQueries('tableStructure');
					setSetting('enabledColumns', (cols) => cols.filter(c => c !== column.id));
				}
			})}>
				&times;
			</span>
			<br/>
			<span style={{ color }}>
				{isLoading ? 'computing..' : (report?.error ?? report?.success)}
			</span>
		</div>
	);
}

export function GenericsSelector() {
	const { tables, series, columns } = useContext(TableContext);
	const { set: setSetting } = useContext(SettingsContext);
	const [state, setInputState] = useState(() => ({
		entity: tables[0],
		type: null as string | null,
		series: null as string | null,
		poi: null as string | null,
		poiType: 'max',
		poiSeries: Object.keys(series)[0],
		shift: 0,
	}));
	const set = (what: string) => (value: string | null) => setInputState(st => ({ ...st, [what]: value }));
	const entityName = (en: string) => prettyTable(en).slice(0, -1);

	const { isLoading, report, mutate, color } = useMutationHandler(async () => {
		const { entity, type, shift } = state;
		const poi = state.poi !== 'extremum' ? state.poi : `${state.poiType}_${state.poiSeries}`;
		const body = {
			entity, type,
			...(!type?.includes('time') && { series: state.series }),
			...(!EXTREMUM_OPTIONS.includes(type as any) && { poi }),
			...(type === 'value' && { shift })
		};
		const res = await fetch(`${process.env.REACT_APP_API}api/events/generics/add`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.status === 401)
			throw new Error('Not authorized');
		if (res.status === 400)
			throw new Error(await res.text());
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		const resp = await res.json();
		setSetting('enabledColumns', (cols) => cols.includes(resp.id) ? cols : [...cols, resp.id]);
		return `Created ${resp.name} in ${resp.time.toFixed(1)} s`;
	}, ['tableStructure', 'tableData']);

	const showPoi = !EXTREMUM_OPTIONS.includes(state.type as any) && state.type !== 'coverage';
	const poiOptions = ['extremum', 'next', 'previous'].concat(tables);
	const poiPretty = ['<Extremum>', '<Next event>', '<Previous event>'].concat(tables.map(entityName));
	const userGenerics = columns.filter(c => c.user_generic_id);
	const count = userGenerics.length;
	const height = document.body.offsetHeight - 160;
	const cols = Math.ceil(count * 48 / height);

	return (<>
		<div className='PopupBackground' style={{ opacity: .5 }}></div>
		<div className='Popup' style={{ transform: 'none', maxHeight: '80vh', padding: '1em 2em 2em 0' }} onClick={e => e.stopPropagation()}>
			<div style={{ position: 'relative' }}>
				<div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridTemplateColumns: `repeat(${cols}, auto)`, textAlign: 'right' }}>
					{userGenerics.map(c => <GenericCard key={c.id} column={c}/>)}
				</div>
				<div style={{ width: '18em', display: 'inline-flex', flexDirection: 'column', textAlign: 'right', gap: '4px' }}>
					<h3 style={{ margin: '0 4px 1em 0' }}>Create custom column</h3>
					<MenuSelect text='Entity' value={state.entity} options={tables} pretty={tables.map(entityName)} callback={set('entity')} width={'9.9em'}/>
					<MenuSelect text='Type' value={state.type} options={TYPE_OPTIONS} withNull={true} callback={set('type')} width={'9.9em'}/>
					{!state.type?.includes('time') && <MenuSelect text='Series' value={state.series} options={Object.keys(series)} withNull={true} pretty={Object.values(series)} callback={set('series')} width={'9.9em'}/>}
					{showPoi && <MenuSelect text='POI' value={state.poi} options={poiOptions} withNull={true} pretty={poiPretty} callback={set('poi')} width={'9.9em'}/>}
					{showPoi && state.poi === 'extremum' && <MenuSelect text='Extremum' value={state.poiType} options={EXTREMUM_OPTIONS} callback={set('poiType')} width={'9.9em'}/>}
					{showPoi && state.poi === 'extremum' && <MenuSelect text='of Series' value={state.poiSeries} options={Object.keys(series)} pretty={Object.values(series)} callback={set('poiSeries')} width={'9.9em'}/>}
					{state.type === 'value' && <MenuInput text='Shift' type='number' min='-48' max='48' step='1' value={state.shift} onChange={set('shift')}/>}
					<div>
						<button style={{ width: 'calc(4px + 9.9em)', margin: '1em 4px 0 0' }} onClick={mutate}>{isLoading ? '...' : 'Create column'}</button>
					</div>
					<div style={{ height: '1em', color, margin: '4px 4px 0 0' }}>
						{report && (report.error ?? report.success)}
					</div>
				</div>

			</div>
		</div>
	</>);
}