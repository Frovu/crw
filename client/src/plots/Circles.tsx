import '../css/Circles.css';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSize } from '../util';
import { linePaths, circlePaths } from './plotUtil';
import { useQuery } from 'react-query';
import { Quadtree } from './quadtree';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';

type CirclesParams = {
	interval: [Date, Date],
	base?: Date,
	exclude?: string[],
	window?: number,
	minamp?: number 
};

function circlesPlotOptions(interactive: boolean, initial: Partial<uPlot.Options>): Partial<uPlot.Options> {
	let qt: Quadtree;
	let hoveredRect: { sidx: number, didx: number, w: number } | null = null;
	const legendValue = u => {
		if (u.data == null || hoveredRect == null)
			return '';
		const d = u.data[hoveredRect.sidx];
		const stIdx = d[3][hoveredRect.didx], lon = d[1][hoveredRect.didx].toFixed(2);
		const time = new Date(d[0][hoveredRect.didx] * 1000).toISOString().replace(/\..*|T/g, ' ');
		return `[ ${stations[stIdx]} ] v = ${d[2][hoveredRect.didx].toFixed(2)}%, aLon = ${lon}, time = ${time}`;
	};
	return {
		...initial,
		padding: [0, 0, 0, 0],
		mode: 2,
		cursor: !interactive ? undefined : {
			drag: { x: false, y: false, setScale: false },
			dataIdx: (u, seriesIdx) => {
				if (seriesIdx > 2) {
					return u.posToIdx(u.cursor.left! * devicePixelRatio);
				} if (seriesIdx === 1) {
					const cx = u.cursor.left! * devicePixelRatio;
					const cy = u.cursor.top! * devicePixelRatio;
					qt.hover(cx, cy, (o: any) => {
						hoveredRect = o;
					});
				}
				return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.didx : 0;
			},
			points: {
				size: (u, seriesIdx) => {
					return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.w / devicePixelRatio : 0;
				}
			}
		},
		hooks: {
			drawClear: [
				u => {
					u.setSelect({
						left: u.valToPos(base, 'x'),
						top: 0,
						width: u.valToPos(base + 86400, 'x') - u.valToPos(base, 'x'),
						height: u.over.offsetHeight
					});
					qt = qt || new Quadtree(0, 0, u.bbox.width, u.bbox.height);
					qt.clear();
					u.series.forEach((s, i) => {
						if (i > 0) (s as any)._paths = null;
					});
				},
			],
		},
		axes: [
			{
				font: style.font,
				stroke: style.text,
				grid: { stroke: style.grid, width: 1 },
				ticks: { stroke: style.grid, width: 1 },
				space: 70,
				size: 40,
				values: (u, vals) => vals.map(v => {
					const d = new Date(v * 1000);
					const day = String(d.getUTCDate()).padStart(2, '0');
					const hour =  String(d.getUTCHours()).padStart(2, '0');
					return day + '\'' + hour;
				})
			},
			{
				// label: 'asimptotic longitude, deg',
				scale: 'y',
				font: style.font,
				stroke: style.text,
				values: (u, vals) => vals.map(v => v.toFixed(0)),
				ticks: { stroke: style.grid, width: 1 },
				grid: { stroke: style.grid, width: 1 }
			},
			{
				scale: 'idx',
				show: false
			}
		],
		scales: {
			x: {
				time: false,
				range: (u, min, max) => [min, max],
			},
			y: {
				range: [-5, 365],
			},
			idx: {
				range: [ -.04, 3.62 ]
			}
		},
		series: [
			{ facets: [ { scale: 'x', auto: true } ] },
			{
				label: '+',
				facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
				stroke: 'rgba(0,255,255,1)',
				fill: 'rgba(0,255,255,0.5)',
				value: legendValue,
				paths: drawCircles
			},
			{
				label: '-',
				facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
				stroke: 'rgba(255,10,110,1)',
				fill: 'rgba(255,10,110,0.5)',
				value: legendValue,
				paths: drawCircles
			},
			{
				scale: 'idx',
				label: 'idx',
				stroke: 'rgba(255,170,0,0.9)',
				facets: [ { scale: 'x', auto: true }, { scale: 'idx', auto: true } ],
				value: (u, v, si, di) => u.data[3][1][di] || 'NaN',
				paths: uPlot.linePaths(1.75)
			}
		]
	};
}

async function queryCircles(params: CirclesParams) {
	const urlPara = new URLSearchParams({
		from: (params.interval[0].getTime() / 1000).toFixed(0),
		to:   (params.interval[1].getTime() / 1000).toFixed(0),
		...(params.exclude && { exclude: params.exclude.join() }),
		...(params.window && { window: params.window.toString() }),
		...(params.minamp && { minamp: params.minamp.toString() }),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + 'api/neutron/ros/?' + urlPara);
	if (res.status !== 200)
		throw new Error('HTTP '+res.status);
	const data = await res.json();
	return data;
}

export function PlotCircles({ params, interactive=true }: { params: CirclesParams, interactive?: boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const size = useSize(ref, 'parent');
	const query = useQuery('ros'+JSON.stringify(params), () => queryCircles(params));

	const [ uplot, setUplot ] = useState<uPlot>();
	const data = query.data;

	useLayoutEffect(() => {
		if (uplot) uplot.setData(data);
	}, [uplot, data]);

	useLayoutEffect(() => {
		if (uplot) uplot.setSize(size);
	}, [uplot, size]);

	const plotComponent = useMemo(() => {
		if (!query.data) return;
		const options = circlesPlotOptions(interactive, { ...size });
		return <UplotReact {...{ options, data: query.data, onCreate: setUplot }}/>;
	}, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

	if (query.isLoading)
		return <div>Loading...</div>;
	if (!query.data)
		return <div>Failed to obrain data</div>;
	return <div ref={ref}>{plotComponent}</div>;
}

export default function PlotCirclesStandalone() {
	const params: CirclesParams = { interval: [ new Date('2021-12-06'), new Date('2021-12-12') ] };
	return <div style={{ resize: 'both', height: '100vh', width: '100vw' }}><PlotCircles {...{ params }}/></div>;
}