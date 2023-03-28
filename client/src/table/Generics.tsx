import { useContext, useState } from 'react';
import { prettyTable, TableContext } from './Table';
import { MenuInput, MenuSelect } from './TableMenu';

const EXTREMUM_OPTIONS = ['min', 'max', 'abs_min', 'abs_max'] as const;
const TYPE_OPTIONS = ['value', 'time_to', 'time_to_%', ...EXTREMUM_OPTIONS] as const;

export function GenericsSelector() {
	const { tables, series } = useContext(TableContext);
	const [state, setInputState] = useState(() => ({
		entity: tables[0],
		type: 'value',
		series: Object.keys(series)[0],
		poi: tables[0],
		poiType: 'max',
		poiSeries: Object.keys(series)[0],
		shift: 0,
	}));
	const set = (what: string) => (value: string | null) => setInputState(st => ({ ...st, [what]: value }));
	const entityName = (en: string) => prettyTable(en).slice(0, -1);

	const showPoi = !EXTREMUM_OPTIONS.includes(state.type as any);
	const poiOptions = tables.concat('extremum');
	const poiPretty = tables.map(entityName).concat('<Extremum>');

	return (<>
		<div className='PopupBackground' style={{ opacity: .5 }}></div>
		<div className='Popup' style={{ transform: 'none' }} onClick={e => e.stopPropagation()}>
			<div style={{ width: '18em', display: 'flex', flexDirection: 'column', textAlign: 'right', gap: '4px' }}>
				<h3 style={{ margin: '1em 4px 1em 0' }}>Create custom column</h3>
				<MenuSelect text='Entity' value={state.entity} options={tables} pretty={tables.map(entityName)} callback={set('entity')} width={'9.9em'}/>
				<MenuSelect text='Type' value={state.type} options={TYPE_OPTIONS} callback={set('type')} width={'9.9em'}/>
				<MenuSelect text='Series' value={state.series} options={Object.keys(series)} pretty={Object.values(series)} callback={set('series')} width={'9.9em'}/>
				{showPoi && <MenuSelect text='POI' value={state.poi} options={poiOptions} pretty={poiPretty} callback={set('poi')} width={'9.9em'}/>}
				{showPoi && state.poi === 'extremum' && <MenuSelect text='Extremum' value={state.poiType} options={EXTREMUM_OPTIONS} callback={set('poiType')} width={'9.9em'}/>}
				{showPoi && state.poi === 'extremum' && <MenuSelect text='of Series' value={state.poiSeries} options={Object.keys(series)} pretty={Object.values(series)} callback={set('poiSeries')} width={'9.9em'}/>}
				{showPoi && <MenuInput text='Shift' type='number' min='-48' max='48' step='1' value={state.shift} onChange={set('shift')}/>}
				<div>
					<button style={{ width: 'calc(4px + 9.9em)', margin: '1em 4px 0 0' }}>Create column</button>

				</div>
			</div>
		</div>
	</>);
}