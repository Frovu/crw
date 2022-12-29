import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import regression from 'regression';
import { CorrParams, DataContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, color } from './plotUtil';

export default function CorrelationPlot() {
	const { options: { correlation: params } } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const { sample } = useContext(DataContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const plotOpts = useMemo(() => {
		if (!sample.length) return null;

		const colIdx = ['columnX', 'columnY'].map(c => Object.keys(columns).indexOf(params[c as keyof CorrParams] as string));
		const data = sample.map(row => colIdx.map(i => row[i])).filter(r => r[0] != null).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		const minx = data[0][0];
		const maxx = data[data.length-1][0];
		const miny = Math.min.apply(null, plotData[1]);
		const maxy = Math.max.apply(null, plotData[1]);

		const regr = params.regression && regression.linear(data as any, { precision: 6 });
		const regrPoints = regr && Array(64).fill(0).map((a, i) => i * (maxx-minx)/64);
		const regrPredicts = regrPoints && regrPoints.map(x => regr.predict(x)[1]);
		const regrLine: any = regr ? [[regrPoints, regrPredicts]] : [];

		console.log(regrLine);
		console.log(minx, maxx);
		console.log(miny, maxy);

		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				mode: 2,
				padding: [10, 4, regr ? 30 : 0, 0],
				title: (regr ? `${regr.string}; r2 = ${regr.r2.toFixed(2)}` : ''),
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(),
						label: params.columnX,
						labelSize: 22,
						size: 30,
					},
					{
						...axisDefaults(),
						label: params.columnY,
						size: 56,
					},
				],
				scales: {
					x: {
						time: false,
						range: [minx, maxx]
					},
					y: { 
						range: [miny, maxy]
					}
		
				},
				series: [
					null,
					{
						stroke: color(params.color),
						paths: pointPaths(4)
					}
				].concat(regr ? [{
					stroke: color('white'),
					paths: linePaths(2)
				}] : [])
			} as uPlot.Options,
			data: [plotData, plotData, ...regrLine] as any // UplotReact seems to not be aware of faceted plot mode
		}) ;
	}, [params, columns, sample]);

	if (!plotOpts) return null;
	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...plotOpts(size)}/>
	</div>);
}
