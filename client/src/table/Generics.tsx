import { useContext, useState } from 'react';
import { useQueryClient } from 'react-query';
import { useMutationHandler } from '../util';
import { ColumnDef, prettyTable, SettingsContext, TableContext } from './Table';
import { MenuInput, MenuSelect } from './TableMenu';

const EXTREMUM_OPTIONS = ['min', 'max', 'abs_min', 'abs_max'] as const;
const TYPE_OPTIONS = ['time_to', 'time_to_%', ...EXTREMUM_OPTIONS, 'mean', 'median', 'range', 'value', 'clone', 'coverage'] as const;

function GenericCard({ column, setState }: { column: ColumnDef, setState: (a: any) => void }) {
	const queryClient = useQueryClient();
	const { set: setSetting } = useContext(SettingsContext);
	const { mutate, report, color, isLoading } = useMutationHandler(async (action) => {
		const res = await fetch(`${process.env.REACT_APP_API}api/events/generics/${action}`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: column.generic!.id })
		});
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.text();
	});
	const copyToInputState = () => {
		const g = column.generic!;
		let poi = g.poi;
		let poiSeries = null;
		for (const ext of EXTREMUM_OPTIONS) {
			if (poi.startsWith(ext)) {
				poiSeries = poi.slice(ext.length + 1);
				poi = ext;
				break;
			}
		}
		setState({
			entity: g.entity,
			type: g.type,
			series: g.series || null,
			poi: poiSeries ? 'extremum' : poi || null,
			poiType: poiSeries ? poi : null,
			poiSeries: poiSeries,
			shift: g.shift,
		});
	};

	return (
		<div style={{ height: '3em', minWidth: '11em', whiteSpace: 'nowrap', marginLeft: '2em' }}>
			<span style={{ cursor: 'pointer' }} onClick={copyToInputState}>{column.fullName}</span>
			<span className='CloseButton' style={{ margin: '4px 0 0 8px', transform: 'translateY(-3px)', color: 'var(--color-green)', fontSize: 21 }}
				onClick={() => mutate('compute', {
					onSuccess: () => {
						queryClient.invalidateQueries('tableData');
						setSetting('enabledColumns', (cols) => cols.includes(column.id) ? cols : [...cols, column.id]);
					}
				})}>
				o
			</span>
			<span className='CloseButton' style={{ margin: '4px 0 0 6px', transform: 'none' }} onClick={() => mutate('remove', {
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
		type: null as typeof TYPE_OPTIONS[number] | null,
		series: null as string | null,
		poi: null as string | null,
		poiType: 'max',
		poiSeries: Object.keys(series)[0],
		shift: 0,
	}));
	const set = (what: string) => (value: string | null) => setInputState(st => ({ ...st, [what]: value }));
	const entityName = (en: string) => prettyTable(en).slice(0, -1);

	const { isLoading, report, setReport, mutate, color } = useMutationHandler(async () => {
		const { entity, type, shift } = state;
		const poi = state.poi !== 'extremum' ? state.poi : `${state.poiType}_${state.poiSeries}`;
		const body = {
			entity, type,
			...(!type?.includes('time') && { series: state.series }),
			...(poi && { poi }),
			...(shift && { shift })
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
		return await res.json();
	}, ['tableStructure', 'tableData']);

	const showPoi = true; // !['range', 'coverage', null].concat(EXTREMUM_OPTIONS).includes(state.type as any);
	const entityOptions = tables.filter(t => columns.find(c => c.table === t && c.name === 'time'));
	const entityPretty = entityOptions.map(entityName);
	const seriesCols = state.type === 'clone' && columns.filter(c => (state.poi ?? state.entity) === c.table);
	const seriesOptions = seriesCols ? seriesCols.map(c => c.id.replace(c.table.split('_').map(t=>t[0]).join('')+'_','')) : Object.keys(series);
	const seriesPretty = seriesCols ? seriesCols.map(c => c.name) : Object.values(series);
	const poiEntityEnd = entityOptions.filter(t => columns.find(c => c.table === t && c.name === 'duration'));
	const poiOptions = seriesCols ? tables : ['extremum'].concat(entityOptions.concat(poiEntityEnd.map(t => 'end_' + t)));
	const poiPretty = seriesCols ? tables.map(entityName) : ['<Extremum>'].concat(entityPretty.concat(poiEntityEnd.map(t => entityName(t).replace(/([A-Z])[a-z ]+/g, '$1') + ' End')));
	const userGenerics = columns.filter(c => c.generic);
	const count = userGenerics.length;
	const height = document.body.offsetHeight - 160;
	const cols = Math.ceil(count * 48 / height);

	return (<>
		<div className='PopupBackground' style={{ opacity: .5 }}></div>
		<div className='Popup' style={{ transform: 'none', maxHeight: '80vh', overflow: 'scroll', padding: '1em 2em 2em 0' }} onClick={e => e.stopPropagation()}>
			<div style={{ position: 'relative' }}>
				<div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridTemplateColumns: `repeat(${cols}, auto)`, textAlign: 'right' }}>
					{userGenerics.length > 0 && <span style={{ marginLeft: '.5em', color: 'var(--color-text-dark)' }}>Click name to copy settings</span>}
					{userGenerics.map(c => <GenericCard key={c.id} column={c} setState={setInputState}/>)}
				</div>
				<div style={{ width: '18em', display: 'inline-flex', flexDirection: 'column', textAlign: 'right', gap: '4px' }}>
					<h3 style={{ margin: '0 4px 1em 0' }}>Create custom column</h3>
					<MenuSelect text='Entity' value={state.entity} options={entityOptions} pretty={entityPretty} callback={set('entity')} width={'9.9em'}/>
					<MenuSelect text='Type' value={state.type} options={TYPE_OPTIONS} withNull={true} callback={set('type')} width={'9.9em'}/>
					{!state.type?.includes('time') && <MenuSelect text='Series' value={state.series} options={seriesOptions} withNull={true} pretty={seriesPretty} callback={set('series')} width={'9.9em'}/>}
					{showPoi && <MenuSelect text='POI' value={state.poi} options={poiOptions} withNull={true} pretty={poiPretty} callback={set('poi')} width={'9.9em'}/>}
					{showPoi && state.poi === 'extremum' && <MenuSelect text='Extremum' value={state.poiType} options={EXTREMUM_OPTIONS} callback={set('poiType')} width={'9.9em'}/>}
					{showPoi && state.poi === 'extremum' && <MenuSelect text='of Series' value={state.poiSeries} options={seriesOptions} pretty={seriesPretty} callback={set('poiSeries')} width={'9.9em'}/>}
					{showPoi && <MenuInput text='Shift' type='number' min='-48' max='48' step='1' value={state.shift} onChange={set('shift')}/>}
					<div>
						<button style={{ width: 'calc(4px + 9.9em)', margin: '1em 4px 0 0' }} onClick={() => mutate(null, {
							onSuccess: (res) => {
								setSetting('enabledColumns', ((cls) => cls.includes(res.id) ? cls : [...cls, res.id]));
								setReport({ success: `Created ${res.name} in ${res.time.toFixed(1)} s` });
							}
						})}>{isLoading ? '...' : 'Create column'}</button>
					</div>
					<div style={{ height: '1em', color, margin: '4px 4px 0 0' }}>
						{report && (report.error ?? report.success)}
					</div>
				</div>

			</div>
		</div>
	</>);
}