import { useContext, useMemo } from 'react';
import regression from 'regression';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, color, getFontSize, scaled } from './plotUtil';
import { MainTableContext, PanelParams, SampleContext, useEventsSettings } from '../events/events';
import { LayoutContext, ParamsSetter } from '../Layout';
import { ExportableUplot } from '../events/ExportPlot';
import uPlot from 'uplot';

const colors = ['magenta', 'acid', 'cyan', 'green'];

export type CorrelationParams = {
	column0: string,
	column1: string,
	color: string,
	loglog: boolean,
	logx: boolean,
};

export const defaultCorrParams: CorrelationParams = {
	column0: 'fe_kp_max',
	column1: 'fe_bz_min',
	color: 'magenta',
	loglog: false,
	logx: true,
};

export function CorrelationContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { columns } = useContext(MainTableContext);
	const { shownColumns } = useEventsSettings();
	const cur = { ...defaultCorrParams, ...params.statParams };
	const columnOpts = columns.filter(c => (['integer', 'real'].includes(c.type) && shownColumns.includes(c.id))
		|| (['column0', 'column1'] as const).some(p => cur[p] === c.id));

	const ColumnSelect = ({ k }: { k: keyof CorrelationParams }) =>
		<select className='Borderless' style={{ maxWidth: '10em', marginLeft: 4 }} value={cur[k] as string}
			onChange={e => setParams('statParams', { [k]: e.target.value })}>
			{columnOpts.map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
		</select>;
	const Checkbox = ({ text, k }: { text: string, k: keyof CorrelationParams }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={cur[k] as boolean} onChange={e => setParams('statParams', { [k]: e.target.checked })}/></label>;
	return <>
		<div>
			X:<ColumnSelect k='column0'/>
		</div> <div>
			Y:<ColumnSelect k='column1'/>
		</div> <div className='separator'/> <div className='Row'>
			color:<select className='Borderless' value={cur.color}
				onChange={e => setParams('statParams', { color: e.target.value })}>
				{colors.map(c => <option key={c} value={c}>{c}</option>)}
			</select>
		</div> <div className='Row'>
			<Checkbox text='loglog' k='loglog'/>
			<Checkbox text='logx' k='logx'/>
		</div>
	</>;
}

export default function CorrelationPlot() {
	const { showGrid } = useEventsSettings();
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { columns } = useContext(MainTableContext);
	const { data: sampleData } = useContext(SampleContext);

	const memo = useMemo(() => {
		const params = { ...defaultCorrParams, ...layoutParams };

		if (!sampleData.length)
			return null;
		const loglog = params.loglog;
		const colIdx = ['column0', 'column1'].map(c => columns.findIndex(cc => cc.id === params[c as keyof CorrelationParams]));
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
		// const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		const title = regr ? <span><span style={{ color: color('text-dark') }}>α={intercept.toFixed(2)}; </span>
			β={gradient.toFixed(3)} ± {err.toFixed(3)}; r={Math.sqrt(regr.r2).toFixed(2)}</span> : null;
		
		return {
			title,
			options: () => ({
				mode: 2,
				padding: [8, 12, 0, 0].map(p => scaled(p)) as any,
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(showGrid),
						space: getFontSize() * 2.5,
						label: colX.fullName,
						size: getFontSize() + scaled(12),
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
						...(params.logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
						values: (u, vals) => vals.map(v => loglog && params.logx ? v?.toString()
							.replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
					},
					{
						...axisDefaults(showGrid),
						label: colY.fullName,
						size: getFontSize() * 3,
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 10000, 100000, 1000000],
						values: (u, vals) => vals.map(v => loglog ? v?.toString()
							.replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
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
					{}, {
						stroke: color(params.color),
						paths: pointPaths(scaled(4))
					}, {
						stroke: color('white'),
						paths: linePaths(scaled(1.5))
					}
				]
			} as Omit<uPlot.Options, 'width'|'height'>),
			data: [plotData, plotData, [regrPoints, regrPredicts]] as any // UplotReact seems to not be aware of faceted plot mode
		};
	}, [columns, layoutParams, sampleData, showGrid]);

	if (!memo) return <div className='Center'>NOT ENOUGH DATA</div>;
	const { title, options, data } = memo;
	return (<>
		{title && <div style={{ textAlign: 'center', userSelect: 'text' }}>{title}</div>}
		<ExportableUplot {...{ size: (sz) => ({ ...sz, height: sz.height - (title ? 22 : 0) }), options, data }}/>
	</>);
}
