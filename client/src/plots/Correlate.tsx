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
		const colIdx = ['columnX', 'columnY'].map(c => Object.keys(columns).indexOf(params[c as keyof CorrParams] as string));
		const data = sample.map(row => colIdx.map(i => row[i])).filter(r => r[0] != null).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		// FIXME: amepty data

		const regr = params.regression && regression.linear(data as any, { precision: 6 });
		const regrPoints = regr && [data[0][0], data[data.length - 1][0]];
		const regrPredicts = regrPoints && regrPoints.map(x => regr.predict(x)[1]);
		const regrLine: any = regr ? [[regrPoints, regrPredicts]] : [];

		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				mode: 2,
				padding: [10, 4, 0, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(),
						label: params.columnX + (regr ? `    r2 = ${regr.r2.toFixed(2)}; ${regr.string}` : ''),
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
						time: false
					},
					y: { 
						// range: (u, min, max) => [min, max]
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

	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...plotOpts(size)}/>
	</div>);
}
