import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import regression from 'regression';
import { SampleContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, clickDownloadPlot, color, drawBackground } from './plotUtil';
import { CorrParams } from '../table/Statistics';

export default function CorrelationPlot() {
	const { options: { correlation: params }, settings: { plotGrid } } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const { data: sampleData } = useContext(SampleContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const plotOpts = useMemo(() => {
		if (!sampleData.length) return null;
		const loglog = params.loglog;
		const colIdx = ['columnX', 'columnY'].map(c => columns.findIndex(cc => cc.id === params[c as keyof CorrParams]));
		if (colIdx.includes(-1)) return null;
		const filter = loglog ? ((r: number[]) => r[0] > 1 && r[1] > 1) : ((r: number[]) => r[0] != null && r[1] != null);
		const data = sampleData.map(row => colIdx.map(i => row[i])).filter(filter).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		if (data.length < 8) return null;

		const minx = data[0][0];
		const maxx = data[data.length-1][0];
		const miny = Math.min.apply(null, plotData[1]);
		const maxy = Math.max.apply(null, plotData[1]);

		const regrData = loglog ? data.map(r => [Math.log(r[0]), Math.log(r[1])]) : data;
		const regr = regression.linear(regrData as any, { precision: 6 });
		const [a, b] = regr.equation;
		const equ = `${loglog?'ln(y)':'y'} = ${a.toFixed(4)}${loglog?' ln(x)':' x'} ${b>0?'+':'-'} ${Math.abs(b).toFixed(1)}`;
		// const equ = loglog ? 'ln(y)' : 'y' + a.toFixed(4) `ln(x) + ${b.toFixed(1)}` : `y = ${a.toFixed(4)}x + ${b.toFixed(1)}`;
		const regrPoints = Array(128).fill(0).map((_, i) => minx + i * (maxx-minx)/128);
		const regrPredicts = regrPoints.map(x => loglog ? Math.pow(Math.E, regr.predict(Math.log(x))[1]) : regr.predict(x)[1] );
		const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toString().length));

		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				height: asize.height - 30,
				// width: Math.min(asize.width, asize.height*1.5),
				mode: 2,
				padding: [8, 12, 0, 0],
				title: (regr ? `${equ}; r = ${Math.sqrt(regr.r2).toFixed(2)}` : ''),
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(plotGrid),
						label: columns.find(c => c.id === params.columnX)?.fullName,
						labelSize: 22,
						size: 30,
						...(params.logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
						values: (u, vals) => vals.map(v => loglog && params.logx ? v?.toString().replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
					},
					{
						...axisDefaults(plotGrid),
						label: columns.find(c => c.id === params.columnY)?.fullName,
						size: 32 + 11 * (maxWidthY - 2),
						values: (u, vals) => vals.map(v => loglog ? v?.toString().replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
					},
				],
				scales: {
					x: {
						time: false,
						distr: params.logx && loglog ? 3 : 1,
						...(params.logx && maxx - minx < 1000 && { range: [minx, maxx] })
					},
					y: { 
						distr: loglog ? 3 : 1,
						...(!loglog && { range: [miny, maxy] })
					}
		
				},
				series: [
					null,
					{
						stroke: color(params.color),
						paths: pointPaths(4)
					},
					{
						stroke: color('white'),
						paths: linePaths(2)
					}
				],
				hooks: {
					drawClear: [ drawBackground ]
				}
			} as uPlot.Options,
			data: [plotData, plotData, [regrPoints, regrPredicts]] as any // UplotReact seems to not be aware of faceted plot mode
		}) ;
	}, [params, columns, sampleData, plotGrid]);

	if (!plotOpts) return <div className='Center'>NOT ENOUGH DATA</div>;
	return (<div ref={setContainer} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...plotOpts(size)}/>
	</div>);
}
