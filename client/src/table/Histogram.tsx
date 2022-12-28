import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { DataContext, SettingsContext, TableContext } from './Table';
import { useSize } from '../util';
import { axisDefaults, color } from '../plots/plotUtil';
import { MenuInput, MenuSelect } from './TableMenu';

const yScaleOptions = ['count', 'log', '%'] as const;

const histSampleOptions = [null, 'current', 'everything', 'custom'] as const;

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
	binCount: 10,
	yScale: '%',
	sample0: 'current',
	sample1: null,
	sample2: null,
	column0: 'magnitude',
	column1: 'magnitude',
	column2: 'magnitude'
};

export function HistogramMenu() {
	const { options: { hist }, setOptions } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const set = (key: keyof HistOptions) => (value: any) => setOptions('hist', opts => ({ ...opts, [key]: value }));

	return (<>
		<MenuSelect text='Y scale' value={hist.yScale} options={yScaleOptions} callback={set('yScale')}/>
		<MenuInput text='Bin count' type='number' min='2' step='1' value={hist.binCount} onChange={set('binCount')}/>
		<h4>First sample</h4>
		<MenuSelect text='Type' value={hist.sample0} width='10em' options={histSampleOptions} callback={set('sample0')}/>
		<MenuSelect text='Column' value={hist.column0} width='10em' options={Object.keys(columns)} callback={set('column0')}/>
		<h4>Second sample</h4>
		<MenuSelect text='Type' value={hist.sample1} width='10em' options={histSampleOptions} callback={set('sample1')}/>
		{hist.sample1 && 
			<MenuSelect text='Column' value={hist.sample1} width='10em' options={Object.keys(columns)} callback={set('column1')}/>}
		<h4>Third sample</h4>
		<MenuSelect text='Type' value={hist.sample2} width='10em' options={histSampleOptions} callback={set('sample2')}/>
		{hist.sample2 && 
			<MenuSelect text='Column' value={hist.sample2} width='10em' options={Object.keys(columns)} callback={set('column2')}/>}
	</>);
}

export function HistogramPlot() {
	const { data, columns } = useContext(TableContext);
	const { options: { hist: options } } = useContext(SettingsContext);
	const { sample } = useContext(DataContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const hist = useMemo(() => {
		const colIdx = Object.keys(columns).indexOf(options.column0);
		const values = sample.map(row => row[colIdx]).filter(val => val != null).sort((a, b) => a - b);
		const min = Math.min.apply(null, values);
		const max = Math.max.apply(null, values);
		const binCount = options.binCount;
		const binSize = (max - min) / binCount;
		const bins = Array(binCount).fill(0);
		for (const val of values) {
			const bin = Math.floor((val - min) / binSize);
			if (bin >= 0 && bin < binCount)
				++bins[bin];
		}
		const binsAvgs = bins.map((v,i) => i*binSize);
		const transformed = options.yScale === '%' ? bins.map(b => b / values.length) : bins;
		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				padding: [8, 4, 0, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				hooks: {
					draw: [
					],
				},
				axes: [
					{
						...axisDefaults(),
						size: 30,
						labelSize: 20, 
					},
					{
						...axisDefaults(),
						values: (u, vals) => vals.map(v => v && (options.yScale === '%' ? (v*100).toFixed(0) + ' %' : v.toFixed())),
						size: 56
					},
				],
				scales: {
					x: {
						time: false,
						range: (u, umin, umax) => [umin-binSize/4, umax+binSize]
					},
					y: {
						distr: options.yScale === 'log' ? 3 : 1
					}
		
				},
				series: [
					{},
					{
						stroke: color('magenta'),
						fill: color('magenta', .7),
						width: 2,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.8, 64], align: 1 })
					}
				]
			} as uPlot.Options,
			data: [binsAvgs, transformed] as any
		}) ;
	}, [options, columns, sample]);

	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...hist(size)}/>
	</div>);
}