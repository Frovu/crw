import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import regression from 'regression';
import { CorrParams, SampleContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, color } from './plotUtil';

export default function CorrelationPlot() {
	const { options: { correlation: params }, settings: { plotGrid } } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const { data: sampleData } = useContext(SampleContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const plotOpts = useMemo(() => {
		if (!sampleData.length) return null;

		const colIdx = ['columnX', 'columnY'].map(c => columns.findIndex(cc => cc.id === params[c as keyof CorrParams]));
		const data = sampleData.map(row => colIdx.map(i => row[i])).filter(r => r[0] != null).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		if (data.length < 2) return null;

		const minx = data[0][0];
		const maxx = data[data.length-1][0];
		const miny = Math.min.apply(null, plotData[1]);
		const maxy = Math.max.apply(null, plotData[1]);

		const regr = params.regression && regression.linear(data as any, { precision: 6 });
		const equ = regr && `y = ${regr.equation[0].toFixed(2)}x + ${regr.equation[1].toFixed(2)}`;
		const regrPoints = regr && Array(64).fill(0).map((a, i) => minx + i * (maxx-minx)/64);
		const regrPredicts = regrPoints && regrPoints.map(x => regr.predict(x)[1]);
		const regrLine: any = regr ? [[regrPoints, regrPredicts]] : [];
		const maxWidthY = Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed().length));

		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				// height: asize.height - 4,
				// width: Math.min(asize.width, asize.height*1.5),
				mode: 2,
				padding: [10, 4, regr ? 30 : 0, 0],
				title: (regr ? `${equ}; r2 = ${regr.r2.toFixed(2)}` : ''),
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(plotGrid),
						label: columns.find(c => c.id === params.columnX)?.fullName,
						labelSize: 22,
						size: 30,
					},
					{
						...axisDefaults(plotGrid),
						label: columns.find(c => c.id === params.columnY)?.fullName,
						size: 32 + 12 * (maxWidthY - 2),
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
	}, [params, columns, sampleData, plotGrid]);

	if (!plotOpts) return null;
	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...plotOpts(size)}/>
	</div>);
}
