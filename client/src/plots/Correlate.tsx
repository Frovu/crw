import { useContext, useMemo } from 'react';
import regression from 'regression';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, color, getFontSize, measureDigit, scaled, usePlotOverlayPosition, type DefaultPosition } from './plotUtil';
import { type ColumnDef, type PanelParams, MainTableContext, SampleContext, findColumn, useEventsSettings, equalValues, valueToString, useViewState, TableViewContext } from '../events/events';
import { LayoutContext, type ParamsSetter } from '../layout';
import { ExportableUplot } from '../events/ExportPlot';
import uPlot from 'uplot';
import { applyTextTransform, drawCustomLegend, tooltipPlugin } from './basicPlot';
import { Quadtree } from './quadtree';
import { prettyDate } from '../util';
import { NumberInput } from '../Utility';
import { applySample } from '../events/sample';

const colors = ['magenta', 'gold', 'cyan', 'green'];

export type CorrelationParams = {
	sample0: '<current>' | '<none>' | string,
	column0: string | null,
	column1: string | null,
	forceMin: number | null,
	forceMax: number | null,
	forceMinY: number | null,
	forceMaxY: number | null,
	color: string,
	showRegression: boolean,
	loglog: boolean,
	logx: boolean,
};

export const defaultCorrParams: (columns: ColumnDef[]) => CorrelationParams = columns => ({
	sample0: '<current>',
	column0: findColumn(columns, 'VmBm')?.id ?? null,
	column1: findColumn(columns, 'magnitude')?.id ?? null,
	forceMin: null,
	forceMax: null,
	forceMinY: null,
	forceMaxY: null,
	color: 'green',
	showRegression: true,
	loglog: false,
	logx: true,
});

export function CorrelationContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { shownColumns } = useEventsSettings();
	const cur = { ...defaultCorrParams(columns), ...params.statParams };
	const columnOpts = columns.filter(c => (['integer', 'real'].includes(c.type) && shownColumns?.includes(c.id))
		|| (['column0', 'column1'] as const).some(p => cur[p] === c.id));
	const set = <T extends keyof CorrelationParams>(k: T, val: CorrelationParams[T]) =>
		setParams('statParams', { [k]: val });

	const ColumnSelect = ({ k }: { k: keyof CorrelationParams }) =>
		<select className='Borderless' style={{ maxWidth: '10em', marginLeft: 4, padding: 0 }} value={cur[k] as string}
			onChange={e => setParams('statParams', { [k]: e.target.value })}>
			{columnOpts.map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
		</select>;
	const Checkbox = ({ text, k }: { text: string, k: keyof CorrelationParams }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={cur[k] as boolean} onChange={e => setParams('statParams', { [k]: e.target.checked })}/></label>;

	return <div className='Group'>
		<div>
			<span className='TextButton' title='Reset' style={{ userSelect: 'none', cursor: 'pointer' }}
				onClick={() => set('sample0', '<current>')}>Sample:</span>
			<select title='Sample (none = all events)' className='Borderless' style={{ width: '10em', marginLeft: 4,
				color: cur.sample0 === '<current>' ? color('text-dark') : 'unset' }}
			value={cur.sample0} onChange={e => set('sample0', e.target.value)}>
				<option value='<none>'>&lt;none&gt;</option>
				<option value='<current>'>&lt;current&gt;</option>
				{samples.map(({ id, name }) => <option key={id} value={id.toString()}>{name}</option>)}
			</select>
		</div> <div>
			X:<ColumnSelect k='column0'/>
		</div> <div>
			Y:<ColumnSelect k='column1'/>
		</div>
		<div style={{ textAlign: 'right' }}>
			<span className='TextButton' title='Reset' style={{ userSelect: 'none', cursor: 'pointer' }}
				onClick={() => setParams('statParams', { forceMin: null, forceMax: null })}>Limit X:</span>
			<NumberInput style={{ width: '4em', margin: '0 2px', padding: 0 }}
				value={cur.forceMin} onChange={val => set('forceMin', val)} allowNull={true}/>
			;<NumberInput style={{ width: '4em', margin: '0 0 0 6px', padding: 0 }}
				value={cur.forceMax} onChange={val => set('forceMax', val)} allowNull={true}/>
		</div>
		<div style={{ textAlign: 'right' }}>
			<span className='TextButton' title='Reset' style={{ userSelect: 'none', cursor: 'pointer' }}
				onClick={() => setParams('statParams', { forceMinY: null, forceMaxY: null })}>Limit Y:</span>
			<NumberInput style={{ width: '4em', margin: '0 2px', padding: 0 }}
				value={cur.forceMinY} onChange={val => set('forceMinY', val)} allowNull={true}/>
			;<NumberInput style={{ width: '4em', margin: '0 0 0 6px', padding: 0 }}
				value={cur.forceMaxY} onChange={val => set('forceMaxY', val)} allowNull={true}/>
		</div>
		<div className='Row'>
			color:<select className='Borderless' style={{ padding: '0 6px' }} value={cur.color}
				onChange={e => setParams('statParams', { color: e.target.value })}>
				{colors.map(c => <option key={c} value={c}>{c}</option>)}
			</select>
		</div>
		<div className='Row'>
		</div> <div className='Row'>
			<Checkbox text='regression' k='showRegression'/>
			<Checkbox text='loglog' k='loglog'/>
			<Checkbox text='logx' k='logx'/>
		</div>
	</div>;
}

export default function CorrelationPlot() {
	const { showGrid, showLegend } = useEventsSettings();
	const { setCursor, setPlotId } = useViewState();
	const { data: shownData } = useContext(TableViewContext);
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { columns, data: allData } = useContext(MainTableContext);
	const { data: currentData, samples: samplesList } = useContext(SampleContext);

	const defaultPos: DefaultPosition = (u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6, 
		y: 3 });
	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition(defaultPos);

	const memo = useMemo(() => {
		const params = { ...defaultCorrParams(columns), ...layoutParams };
		const { loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY, sample0 } = params;

		const sampleData = sample0 === '<current>' ? currentData : sample0 === '<none>' ? allData :
			applySample(allData, samplesList.find(s => s.id.toString() === sample0) ?? null, columns);

		if (!sampleData.length)
			return null;
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

		const timeIdx = columns.findIndex(c => c.fullName === 'time');
		const findRow = (i: number) => sampleData.find(row =>
			equalValues(row[colIdx[0]], data[i][0]) && equalValues(row[colIdx[1]], data[i][1]));

		let hoveredRect: any;
		let qt: Quadtree;
		return {
			title,
			options: () => {
				const ch = measureDigit().width, scale = scaled(1);
				return {
					mode: 2,
					padding: [8, 12, 0, 0].map(p => scaled(p)) as any,
					legend: { show: false },
					cursor: {
						drag: { x: false, y: false, setScale: false },
						points: {
							width: 2, size: 6,
							stroke: (u, sidx) => sidx === 1 ? color('red') : 'transparent', fill: 'transparent'
						},
						dataIdx: (u, sidx) => {
							const cx = u.cursor.left! * devicePixelRatio;
							const cy = u.cursor.top! * devicePixelRatio;
							hoveredRect = null;
							qt.hover(cx, cy, (o: any) => {
								hoveredRect = o;
							});
							return hoveredRect?.didx ?? -1;
						}
					},
					plugins: [ tooltipPlugin({
						didx: () => hoveredRect?.didx,
						onclick: (u, didx) => {
							const row = findRow(didx);
							if (!row) return;
							setCursor({ row: shownData.findIndex(r => r[0] === row[0]), column: 0 });
							setPlotId(() => row[0]);
						},
						html: (u, sidx, didx) => {
							const row = findRow(didx);
							return row ? `${prettyDate(row[timeIdx] as any)}; ${valueToString(row[colIdx[0]])}, ${valueToString(row[colIdx[1]])}` : '??';
						},
					}) ],
					hooks: {
						drawClear: [ u => { 
							qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
							qt.clear();
						}],
						draw: [ drawCustomLegend({ showLegend }, legendPos, legendSize, defaultPos) ],
						ready: [ handleDragLegend ]
					},
					axes: [
						{
							...axisDefaults(showGrid),
							space: getFontSize() * 2.5,
							label: applyTextTransform(colX.fullName),
							size: getFontSize() + scaled(12),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
							...(logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
							values: (u, vals) => vals.map(v => loglog && logx ? v?.toString()
								.replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
						},
						{
							...axisDefaults(showGrid),
							label: applyTextTransform(colY.fullName),
							size: (u, values) => scale * 12 + ch *
								(values ? Math.max.apply(null, values.map(v => v?.toString().length ?? 0)) : 4),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 10000, 100000, 1000000],
							values: (u, vals) => vals.map(v => loglog ? v?.toString()
								.replace(/00+/, 'e'+v.toString().match(/00+/)?.[0].length) : v?.toString())
						},
					],
					scales: {
						x: {
							time: false,
							distr: logx && loglog ? 3 : 1,
							range: [forceMin ?? minx, forceMax ?? maxx],
						},
						y: { 
							distr: loglog ? 3 : 1,
							range: [forceMinY ?? miny, forceMaxY ?? maxy],
						}
					},
					series: [
						{ facets: [ { scale: 'x', auto: true } ] }, {
							facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
							label: 'scatter',
							legend: sample0 === '<current>' ? undefined : sample0 === '<none>' ? 'all events'
								: samplesList.find(s => s.id.toString() === sample0)?.name,
							marker: 'circle',
							bars: true,
							stroke: color(params.color),
							paths: pointPaths(scaled(4), (r: any) => qt.add(r))
						}, {
							facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
							show: showRegression,
							stroke: color('white'),
							paths: linePaths(scaled(1.5))
						}
					]
				} as Omit<uPlot.Options, 'width'|'height'>;},
			data: [plotData, plotData, [regrPoints, regrPredicts]] as any // UplotReact seems to not be aware of faceted plot mode
		};
	}, [columns, layoutParams, currentData, allData, samplesList, showLegend, legendPos, legendSize, handleDragLegend, showGrid, setCursor, shownData, setPlotId]);

	if (!memo) return <div className='Center'>NOT ENOUGH DATA</div>;
	const { title, options, data } = memo;
	return (<>
		{title && <div style={{ textAlign: 'center', whiteSpace: 'nowrap', overflowX: 'clip', userSelect: 'text' }}>{title}</div>}
		<ExportableUplot {...{ size: (sz) => ({ ...sz, height: sz.height - (title ? 22 : 0) }), options, data }}/>
	</>);
}
