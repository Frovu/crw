import { useContext } from 'react';
import { SettingsContext, TableContext } from './Table';
import { MenuCheckbox, MenuInput, MenuSelect } from './TableMenu';

const yScaleOptions = ['count', 'log', '%'] as const;

const histSampleOptions = [null, 'current', 'custom'] as const;

export type HistOptions = {
	binCount: number,
	yScale: typeof yScaleOptions[number],
	sample0: typeof histSampleOptions[number],
	column0: string,
	sample1: typeof histSampleOptions[number],
	column1: string,
	sample2: typeof histSampleOptions[number],
	column2: string,
};

export const defaultHistOptions: HistOptions = {
	binCount: 20,
	yScale: 'count',
	sample0: 'current',
	sample1: null,
	sample2: null,
	column0: 'kp_max',
	column1: 'magnitude',
	column2: 'magnitude'
};

export function HistogramMenu() {
	const { options: { hist }, setOptions } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const set = (key: any) => (value: any) => setOptions('hist', opts => ({ ...opts, [key]: value }));
	const options = columns.map(c => c.id);
	const pretty = columns.map(c => c.name);

	return (<>
		<MenuSelect text='Y scale' value={hist.yScale} options={yScaleOptions} callback={set('yScale')}/>
		<MenuInput text='Bin count' type='number' min='2' step='1' value={hist.binCount} onChange={set('binCount')}/>
		<h4>First sample</h4>
		<MenuSelect text='Type' value={hist.sample0} width='10em' options={histSampleOptions} callback={set('sample0')}/>
		{hist.sample0 && 
			<MenuSelect text='Column' value={hist.column0} width='10em' options={options} pretty={pretty} callback={set('column0')}/>}
		<h4>Second sample</h4>
		<MenuSelect text='Type' value={hist.sample1} width='10em' options={histSampleOptions} callback={set('sample1')}/>
		{hist.sample1 && 
			<MenuSelect text='Column' value={hist.column1} width='10em' options={options} pretty={pretty} callback={set('column1')}/>}
		<h4>Third sample</h4>
		<MenuSelect text='Type' value={hist.sample2} width='10em' options={histSampleOptions} callback={set('sample2')}/>
		{hist.sample2 && 
			<MenuSelect text='Column' value={hist.column2} width='10em' options={options} pretty={pretty} callback={set('column2')}/>}
	</>);
}

export function CorrelationMenu() {
	const { columns } = useContext(TableContext);
	const { options, setOptions } = useContext(SettingsContext);
	const set = (key: any) => (value: any) => setOptions('correlation', opts => ({ ...opts, [key]: value }));
	const filtered = columns.filter(c => !c.hidden);
	const selection = filtered.map(c => c.id);
	const pretty = filtered.map(c => c.fullName);

	return (<>
		<h4>Correlation</h4>
		<MenuSelect text='X' value={options.correlation.columnX} width='10em' options={selection} pretty={pretty} callback={set('columnX')}/>
		<MenuSelect text='Y' value={options.correlation.columnY} width='10em' options={selection} pretty={pretty} callback={set('columnY')}/>
		<MenuSelect text='Color' value={options.correlation.color} width='8em' options={['cyan', 'magenta', 'green', 'acid']} callback={set('color')}/>
		<MenuCheckbox text='Show regression' value={options.correlation.regression} callback={set('regression')}/>
	</>);
}