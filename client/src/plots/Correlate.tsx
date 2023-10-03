import { ReactElement, useContext, useMemo, useState } from 'react';
import UplotReact from 'uplot-react';
import regression from 'regression';
import { useSize } from '../util';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, clickDownloadPlot, color } from './plotUtil';
import { CorrParams } from '../events/Statistics';
import { MainTableContext, SampleContext, useEventsSettings } from '../events/events';

export default function CorrelationPlot() {
	const { showGrid } = useEventsSettings();
	const { columns } = useContext(MainTableContext);
	const { data: sampleData } = useContext(SampleContext);

	

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const memo = useMemo((): null | [ReactElement|null, (asize: { width: number, height: number }) => Parameters<typeof UplotReact>[0]] => {
		const params: CorrParams = {
			columnX: 'fe_v_max',
			columnY: 'fe_magnitude',
			loglog: false,
			logx: false,
			color: 'green'
		}

		if (!sampleData.length)
			return null;
		const loglog = params.loglog;
		const colIdx = ['columnX', 'columnY'].map(c => columns.findIndex(cc => cc.id === params[c as keyof CorrParams]));
		if (colIdx.includes(-1))
			return null;
		const [colX, colY] = colIdx.map(c => columns[c]);
		if (!['integer', 'real'].includes(colX.type) || !['integer', 'real'].includes(colY.type))
			return null;

		const filter = loglog ? ((r: number[]) => r[0] > 1 && r[1] > 1) : ((r: number[]) => r[0] != null && r[1] != null);
		const data = (sampleData as number[][]).map(row => colIdx.map(i => row[i])).filter(filter).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		if (data.length < 8)
			return null;

		const minx = data[0][0];
		const maxx = data[data.length-1][0];
		const miny = Math.min.apply(null, plotData[1]);
		const maxy = Math.max.apply(null, plotData[1]);

		const regrData = loglog ? data.map(r => [Math.log(r[0]), Math.log(r[1])]) : data;
		const regr = regression.linear(regrData as any, { precision: 8 });
		const [gradient, intercept] = regr.equation;

		// standard error: https://en.wikipedia.org/wiki/Simple_linear_regression#Normality_assumption
		const meanX = regrData.reduce((a, b) => a + b[0], 0) / data.length;
		const sumE = regr.points.reduce((a, b) => a + b[1] * b[1], 0);
		const sdmX = regrData.reduce((a, b) => a + Math.pow(b[0] - meanX, 2), 0);
		const err = Math.sqrt(sumE / sdmX / (data.length - 2));
		
		const regrPoints = Array(128).fill(0).map((_, i) => minx + i * (maxx-minx)/128);
		const regrPredicts = regrPoints.map(x => loglog ? Math.pow(Math.E, regr.predict(Math.log(x))[1]) : regr.predict(x)[1]);
		const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		const title = regr ? <span><span style={{ color: color('text-dark') }}>α={intercept.toFixed(2)}; </span>
			β={gradient.toFixed(3)} ± {err.toFixed(3)}; r={Math.sqrt(regr.r2).toFixed(2)}</span> : null;

		return [title, (asize) => ({
			options: {
				...asize,
				mode: 2,
				padding: [8, 16, 6, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(showGrid),
						label: colX.fullName,
						labelSize: 22,
						space: 50,
						size: 34,
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
						...(params.logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
						values: (u, vals) => vals.map(v => loglog && params.logx ? v?.toString().replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
					},
					{
						...axisDefaults(showGrid),
						label: colY.fullName,
						size: 18 + 10 * (maxWidthY),
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 10000, 100000, 1000000],
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
					{},
					{
						stroke: color(params.color),
						paths: pointPaths(4)
					},
					{
						stroke: color('white'),
						paths: linePaths(2)
					}
				]
			},
			data: [plotData, plotData, [regrPoints, regrPredicts]] as any // UplotReact seems to not be aware of faceted plot mode
		})];
	}, [columns, sampleData, showGrid]);

	if (!memo) return <div className='Center'>NOT ENOUGH DATA</div>;
	const [titleText, plotOpts] = memo;
	return (<div ref={setContainer}>
		{titleText && <div style={{ textAlign: 'center' }}>{titleText}</div>}
		<div style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
			<UplotReact {...plotOpts({ ...size, height: size.height - (titleText ? 16 : 0) })}/>
		</div>
	</div>);
}
