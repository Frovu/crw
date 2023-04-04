import { Fragment, useContext } from 'react';
import { SampleContext, SettingsContext, TableContext } from './Table';
import { MenuCheckbox, MenuInput, MenuSelect } from './TableMenu';

const yScaleOptions = ['count', 'log', '%'] as const;

export type HistOptions = {
	binCount: number,
	forceMin: number | null,
	forceMax: number | null,
	yScale: typeof yScaleOptions[number],
	sample0: string,
	column0: string | null,
	sample1: string,
	column1: string | null,
	sample2: string,
	column2: string | null,
};

export const defaultHistOptions: HistOptions = {
	binCount: 16,
	forceMin: null,
	forceMax: null,
	yScale: 'count',
	sample0: 'current',
	sample1: 'current',
	sample2: 'current',
	column0: 'fe_v_max',
	column1: null,
	column2: null
};

export type CorrParams = {
	columnX: string,
	columnY: string,
	color: string,
	regression: boolean,
};

export const defaultCorrParams = {
	columnX: 'fe_kp_max',
	columnY: 'fe_bz_min',
	color: 'magenta',
	regression: true,
};

export function HistogramMenu() {
	const { options: { hist }, setOpt } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const { samples } = useContext(SampleContext);
	const set = (key: any) => (value: any) => setOpt('hist', opts => ({ ...opts, [key]: value }));
	const options = columns.map(c => c.id);
	const pretty = columns.map(c => c.fullName);
	const sampleOptions = ['current', 'none'].concat(samples.map(s => s.id.toString()));
	const samplePretty = ['<current>', '<none>'].concat(samples.map(s => s.name));
	const setBoundary = (key: any) => (a: string) => {
		const val = parseFloat(a);
		set(key)(isNaN(val) ? null : val);
	};
	
	return (<>
		<MenuSelect text='Y scale' value={hist.yScale} options={yScaleOptions} callback={set('yScale')}/>
		<MenuInput text='Bin count' type='number' min='2' step='1' value={hist.binCount} onChange={set('binCount')}/>
		{[0, 1, 2].map(i => {
			const colKey = 'column' + i as keyof HistOptions;
			const sampleKey ='sample' + i as keyof HistOptions;
			return(<Fragment key={colKey}>
				<h4 key={i}>{['First', 'Second', 'Third'][i]} sample</h4>
				<MenuSelect key={colKey} text='Column' value={hist[colKey] as string ?? null} callback={set(colKey)} width='10em' options={options} pretty={pretty} withNull={true}/>
				<MenuSelect key={sampleKey} text='Sample' value={hist[sampleKey] as string} callback={set(sampleKey)} width='10em' options={sampleOptions} pretty={samplePretty}/>
			</Fragment>);})}
		<h4>Force limits</h4>
		<MenuInput text='X >=' type='text' defaultValue={hist.forceMin ?? ''} onChange={setBoundary('forceMin')}/>
		<MenuInput text='X < ' type='text' defaultValue={hist.forceMax ?? ''} onChange={setBoundary('forceMax')}/>
	</>);
}

export function CorrelationMenu() {
	const { columns } = useContext(TableContext);
	const { options, setOpt } = useContext(SettingsContext);
	const set = (key: any) => (value: any) => setOpt('correlation', opts => ({ ...opts, [key]: value }));
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