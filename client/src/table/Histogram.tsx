import { useContext, useMemo, useRef, useState, createContext } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { DataContext, SettingsContext, TableContext } from './Table';
import { useSize } from '../util';
import { axisDefaults, color } from '../plots/plotUtil';
import { MenuSelect } from './TableMenu';

const yScaleOptions = ['count', 'log', '%'] as const;

export type HistOptions = {
	yScale: typeof yScaleOptions[number]
};

export const defaultHistOptions: HistOptions = {
	yScale: '%',
};

export function HistogramMenu() {
	const { options: { hist }, setOptions } = useContext(SettingsContext);

	const set = (key: keyof HistOptions) => (value: any) => setOptions('hist', opts => ({ ...opts, [key]: value }));

	return (<>
		<MenuSelect text='Y scale' value={hist.yScale} options={yScaleOptions} callback={set('yScale')}/>

	</>);
}

export function HistogramPlot() {
	const { data, columns } = useContext(TableContext);
	const { options: { hist: options } } = useContext(SettingsContext);
	const { sample } = useContext(DataContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const hist = useMemo(() => {
		const column = 'magnitude';
		const colIdx = Object.keys(columns).indexOf(column);
		const values = sample.map(row => row[colIdx]).filter(val => val != null).sort((a, b) => a - b);
		const min = Math.min.apply(null, values);
		const max = Math.max.apply(null, values);
		const binCount = 10;
		const binSize = (max - min) / binCount;
		const bins = Array(binCount).fill(0);
		for (const val of values) {
			const bin = Math.floor((val - min) / binSize);
			if (bin >= 0 && bin < binCount)
				++bins[bin];
		}
		const binsAvgs = bins.map((v,i) => i*binSize);
		const data = options.yScale === '%' ? bins.map(b => b / values.length) : bins;
		console.log(data)
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
			data: [binsAvgs, data] as any
		}) ;
	}, [options, columns, sample]);

	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...hist(size)}/>
	</div>);
}