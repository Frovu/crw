import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useEventListener, useSize, ValidatedInput } from '../util';
import { linePaths, circlePaths, pointPaths } from './plotPaths';
import { axisDefaults, BasicPlotParams, color, customTimeSplits, drawOnsets } from './plotUtil';
import { Onset } from '../table/Table';
import { useQuery } from 'react-query';
import { Quadtree } from './quadtree';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';

import 'uplot/dist/uPlot.min.css';
import '../css/Circles.css';

export type CirclesParams = BasicPlotParams & {
	realtime?: boolean,
	base?: Date,
	exclude?: string[],
	window?: number,
	minamp?: number,
};

type CirclesResponse = {
	base: number,
	time: number[],
	variation: (number | null)[][],
	shift: number[],
	station: string[],
	precursor_idx: [number[], number[]], // eslint-disable-line camelcase
	filtered: number,
	excluded: string[]
};

type CirclesMomentResponse = {
	time: number,
	x: number[],
	y: number[],
	fnx: number[],
	fny: number[],
	index: number,
	amplitude: number,
	angle: number
};

function circlesPlotOptions(data: any, params: CirclesParams,
	setBase: (b: Date) => void, setMoment: (time: number) => void): Partial<uPlot.Options> {
	const interactive = params.interactive;
	let qt: Quadtree;
	let hoveredRect: { sidx: number, didx: number, w: number } | null = null;
	const legendValue = (seriesIdx: number) => (u: uPlot) => {
		if (u.data == null || seriesIdx !== hoveredRect?.sidx)
			return '';
		const d = u.data[hoveredRect.sidx] as any;
		const stIdx = d[3][hoveredRect.didx], lon = d[1][hoveredRect.didx].toFixed(2);
		const time = new Date(d[0][hoveredRect.didx] * 1000).toISOString().replace(/\..*|T/g, ' ');
		return `[ ${data.station[stIdx]} ] v = ${d[2][hoveredRect.didx].toFixed(2)}%, aLon = ${lon}, time = ${time}`;
	};
	return {
		padding: [8, 8, 0, 0],
		mode: 2,
		legend: { show: interactive },
		cursor: {
			show: interactive,
			drag: { x: false, y: false, setScale: false },
			...(interactive && {
				dataIdx: (u, seriesIdx) => {
					if (seriesIdx > 2) {
						return u.posToIdx(u.cursor.left! * devicePixelRatio);
					} 
					if (seriesIdx === 1) {
						const cx = u.cursor.left! * devicePixelRatio;
						const cy = u.cursor.top! * devicePixelRatio;
						hoveredRect = null;
						qt.hover(cx, cy, (o: any) => {
							hoveredRect = o;
						});
					}
					return (hoveredRect && seriesIdx === hoveredRect.sidx) ? hoveredRect.didx : -1;
				},
				points: {
					size: (u, seriesIdx) => {
						return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.w / devicePixelRatio : 0;
					}
				}
			})
		},
		hooks: {
			drawClear: [
				u => {
					u.setSelect({
						left: u.valToPos(data.base, 'x'),
						top: 0,
						width: u.valToPos(data.base + 86400, 'x') - u.valToPos(data.base, 'x'),
						height: u.over.offsetHeight
					});
					u.setCursor({ left: -1, top: -1 });
					qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
					qt.clear();
					u.series.forEach((s, i) => {
						if (i > 0) (s as any)._paths = null;
					});
				},
			],
			draw: [ u => (params.onsets?.length) && drawOnsets(u, params.onsets) ],
			ready: [
				u => {
					if (interactive)
						u.over.style.setProperty('cursor', 'pointer');
					let currentBase = data.base;
					const setSelect = (val: number) => u.setSelect({
						left: u.valToPos(val, 'x'),
						top: 0,
						width: u.valToPos(val + 86400, 'x') - u.valToPos(val, 'x'),
						height: u.over.offsetHeight
					});
					setSelect(currentBase);
					let isDragged: boolean, clickX: number | undefined, clickY: number | undefined;
					u.over.addEventListener('mousemove', e => {
						if (isDragged) {
							const dragValue = u.posToVal(e.offsetX, 'x') - u.posToVal(clickX!, 'x');
							currentBase = Math.round((data.base + dragValue) / 3600) * 3600;
							if (currentBase < u.scales.x.min!)
								currentBase = u.scales.x.min;
							if (currentBase > u.scales.x.max! - 86400)
								currentBase = u.scales.x.max! - 86400;
						}
						setSelect(currentBase);
					});
					u.over.addEventListener('mousedown', e => {
						clickX = e.offsetX;
						clickY = e.offsetY;
						isDragged = u.valToPos(data.base, 'x') < clickX && clickX < u.valToPos(data.base + 86400, 'x');
					});
					u.over.addEventListener('mouseup', e => {
						if (currentBase !== data.base) {
							setBase(new Date(currentBase * 1e3));
						} else if (interactive && Math.abs(e.offsetX - clickX!) + Math.abs(e.clientY - clickY!) < 30) {
							const detailsIdx = u.posToIdx(u.cursor.left! * devicePixelRatio);
							if (detailsIdx != null)
								setMoment(data.precursor_idx[0][detailsIdx]);
						}
						isDragged = false;
						clickX = clickY = undefined;
						// setSelect(currentBase);
					});
				}
			]
		},
		axes: [
			{
				...axisDefaults(),
				size: 40,
				...customTimeSplits()
			},
			{
				...axisDefaults(),
				scale: 'y',
				values: (u, vals) => vals.map(v => v.toFixed(0)),
				space: 48,
				gap: 2,
				size: 42,
				incrs: [ 15, 30, 45, 60, 90, 180, 360 ]
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
				stroke: color('cyan'),
				fill: color('cyan', .5),
				value: legendValue(1),
				paths: circlePaths((rect: any) => qt.add(rect))
			},
			{
				label: '-',
				facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
				stroke: color('magenta'),
				fill: color('magenta', .5),
				value: legendValue(2),
				paths: circlePaths((rect: any) => qt.add(rect))
			},
			{
				scale: 'idx',
				label: 'idx',
				stroke: color('acid'),
				facets: [ { scale: 'x', auto: true }, { scale: 'idx', auto: true } ],
				value: (u, v, si, di) => (u.data as any)[3][1][di] || 'NaN',
				paths: linePaths(1.75)
			}
		]
	};
}

function circlesMomentPlotOptions(data: CirclesMomentResponse): uPlot.Options {
	const moment = new Date(data.time * 1000).toISOString().replace(/\..*|T/g, ' ');
	return {
		title: `[ ${moment}] i=${data.index.toFixed(2)} a=${data.amplitude.toFixed(2)}`,
		width: 480,
		height: 480 - 32,
		mode: 2,
		padding: [0, 16, 0, 0],
		legend: { show: false, live: false },
		cursor: {
			show: false,
			drag: { x: false, y: false }
		},
		hooks: { },
		axes: [
			{
				...axisDefaults(),
				size: 36,
				space: 36,
				values: (u, vals) => vals.map(v => v.toFixed(0)),
				incrs: Array(360 / 45).fill(1).map((a,  i) => i * 45)
			},
			{
				...axisDefaults(),
				size: 54,
				space: 36,
				scale: 'y',
				values: (u, vals) => vals.map(v => v.toFixed(1)),
			}
		],
		scales: {
			x: {
				time: false,
				range: [0, 365],
			},
			y: {
				range: (u, min, max) => [min, max],
			}
		},
		series: [
			{},
			{
				stroke: color('magenta'),
				paths: pointPaths(10)
			},
			{
				stroke: color('purple'),
				paths: linePaths(2)
			}
		]
	};
}

async function fetchCircles(params: CirclesParams, base?: Date, moment?: number) {
	const urlPara = new URLSearchParams({
		from: (params.interval[0].getTime() / 1000).toFixed(0),
		to:   (params.interval[1].getTime() / 1000).toFixed(0),
		...(moment && { details: moment.toFixed(0) }),
		...(base && { base: (base.getTime() / 1000).toFixed(0) }),
		...(params.exclude && { exclude: params.exclude.join() }),
		...(params.window && { window: params.window.toString() }),
		...(params.minamp && { minamp: params.minamp.toString() }),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + 'api/neutron/ros/?' + urlPara);
	if (res.status !== 200)
		return null;
	return res.json();
}

async function queryCircles(params: CirclesParams, base?: Date) {
	const resp = await fetchCircles(params, base) as CirclesResponse;
	if (!resp) return resp;
	const slen = resp.shift.length, tlen = resp.time.length;
	if (tlen < 10) return;
	const data = Array.from(Array(4), () => new Array(slen*tlen));
	let posCount = 0, nullCount = 0;
	for (let ti = 0; ti < tlen; ++ti) {
		for (let si = 0; si < slen; ++si) {
			const time = resp.time[ti], vv = resp.variation[ti][si];
			const idx = ti*slen + si;
			// if (vv < maxVar) maxVar = vv;
			if (vv == null) ++nullCount;
			else if (vv >= 0) ++posCount;
			data[0][idx] = time;
			data[1][idx] = (time / 86400 * 360 + resp.shift[si]) % 360;
			data[2][idx] = vv;
			data[3][idx] = si;
		}
	}
	
	const ndata = Array.from(Array(4), () => new Array(slen*tlen - posCount - nullCount));
	const pdata = Array.from(Array(4), () => new Array(posCount));
	let pi = 0, ni = 0;
	for (let idx = 0; idx < slen*tlen; ++idx) {
		const vv = data[2][idx];
		if (vv == null) continue;
		if (vv >= 0) {
			pdata[0][pi] = data[0][idx];
			pdata[1][pi] = data[1][idx];
			pdata[2][pi] = vv;
			pdata[3][pi] = data[3][idx];
			pi++;
		} else {
			ndata[0][ni] = data[0][idx];
			ndata[1][ni] = data[1][idx];
			ndata[2][ni] = vv;
			ndata[3][ni] = data[3][idx];
			ni++;
		}
	}
	const precIdx = resp.precursor_idx;
	console.log('circles data', resp, [ precIdx[0], pdata, ndata, precIdx ]);
	return {
		...resp,
		plotData: [ precIdx[0], pdata, ndata, precIdx ]
	};
}

export function PlotCirclesMoment({ params, base, moment, setMoment, settingsOpen }:
{ params: CirclesParams, base?: Date, moment: number, setMoment: (m: number | null) => void, settingsOpen?: boolean }) {
	const query = useQuery({
		staleTime: 0,
		keepPreviousData: true,
		queryKey: ['rosMoment', params, moment],
		queryFn: (): Promise<CirclesMomentResponse | undefined> => fetchCircles(params, base, moment),
	});

	const plot = useMemo(() => {
		if (!query.data?.time) return null;
		const options = circlesMomentPlotOptions(query.data);
		const data = [[], [query.data.x, query.data.y], [query.data.fnx, query.data.fny]] as any;
		return <UplotReact {...{ options, data }}/>;
	}, [query.data]);

	if (!query.data) return null;
	const middle = params.interval.map(d => d.getTime() / 1000).reduce((a, b) => a + b, 0) / 2;
	const pos = !settingsOpen && moment >= middle ? { left: 40 } : { right: 0 };
	return (
		<div style={{ position: 'absolute', top: 0, ...pos, zIndex: 1, backgroundColor: color('bg', .95), border: '2px dashed' }}
			onClick={() => setMoment(null)}>
			{plot}
		</div>
	);
}

const LEGEND_H = 32;
export function PlotCircles({ params, settingsOpen }:
{ params: CirclesParams, settingsOpen?: boolean }) {
	const interactive = params.interactive;
	const [ base, setBase ] = useState(params.base);
	const [ moment, setMoment ] = useState<number | null>(null);
	const query = useQuery({
		staleTime: params.interactive ? 0 : 60 * 60 * 1000,
		queryKey: ['ros', params, base],
		queryFn: () => queryCircles(params, base),
		keepPreviousData: interactive
	});

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const [ uplot, setUplot ] = useState<uPlot>();
	const plotData = query.data?.plotData;
	
	useEffect(() => setMoment(null), [params.interval]);

	useLayoutEffect(() => {
		if (uplot && plotData) uplot.setData(plotData as any);
	}, [uplot, plotData]);

	useLayoutEffect(() => {
		if (uplot) uplot.setSize({ ...size, ...(interactive && { height: size.height - LEGEND_H })  });
	}, [uplot, size, interactive]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (!interactive) return;
		if (e.target instanceof HTMLInputElement) return;
		if (e.code === 'Escape') setMoment(() => null);
		const move = { ArrowLeft: -3600, ArrowRight: 3600 }[e.code];
		if (!move) return;
		const [ min, max ] = params.interval.map(d => Math.floor(d.getTime() / 1000));
		setMoment(mm => mm && Math.min(Math.max(mm + move, min), max));
	});

	const plotComponent = useMemo(() => {
		if (!plotData || !container || size.height <= 0) return;
		const options = {
			...size, ...(interactive && { height: size.height - LEGEND_H }),
			...circlesPlotOptions(query.data, params, setBase, setMoment)
		} as uPlot.Options;
		return <UplotReact target={container} {...{ options, data: plotData as any, onCreate: setUplot }}/>;
	}, [interactive, plotData, container, size.height <= 0, params.onsets]); // eslint-disable-line react-hooks/exhaustive-deps

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (!query.data)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;

	return (
		<div ref={node => setContainer(node)} style={{ position: 'absolute' }}>
			{moment && <PlotCirclesMoment {...{ params, base, moment, setMoment, settingsOpen }}/>}
			{plotComponent}
			{uplot && moment && ReactDOM.createPortal(
				<div style={{ position: 'absolute', bottom: -22, left: uplot.valToPos(moment, 'x'),
					width: 0, fontSize: 22, color: color('purple'), transform: 'translate(-9px)', textShadow: '0 0 14px '+color('text') }}>⬆</div>
				, uplot.over)}
			{interactive && <div style={{ position: 'absolute', color: 'var(--color-text-dark)', right: 16, bottom: 6 }}>
				{query.isFetching ? 'Fetching...' : (
					(query.data.excluded?.length ? 'Excluded: ' + query.data.excluded.join() : '') +
					(query.data.filtered ? ' Filtered: ' + query.data.filtered : '')
				)}
			</div>}
		</div>
	);
}

export function CirclesParamsInput({ params, setParams }:
{ params: CirclesParams, setParams: (p: CirclesParams) => void  }) {
	const callback = (what: string) => (value: any) => {
		if (what === 'days') {
			const from = new Date(+params.interval[1] - value * 86400000);
			if (params.interval[0] === from) return;
			setParams({ ...params, interval: [ from, params.interval[1] ] });
		} else if (what === 'date') {
			const val = value || new Date(Math.floor(Date.now() / 36e5) * 36e5);
			if (params.interval[1].getTime() === val.getTime()) return;
			const len = params.interval[1].getTime() - params.interval[0].getTime();
			setParams({ ...params, interval: [ new Date(val - len), val ], realtime: !value });
		} else if (what === 'exclude') {
			setParams({ ...params, exclude: value?.replace(/\s+/g, '').split(',') });
		} else if (what === 'onset') {
			if (!value)
				return setParams({ ...params, onsets: undefined });
			setParams({ ...params, onsets: [{ time: value, type: null } as Onset] });
		} else {
			setParams({ ...params, [what]: value });
		}
	};
	const showDate = (d: Date) => d.toISOString().replace('T', ' ').replace(/:\d\d\..+/, '');
	
	return (
		<div className='Settings'>
			<div style={{ textAlign: 'left', paddingLeft: '4em' }}><b>Settings</b></div>
			
			Ending date: 
			<ValidatedInput type='time' value={!params.realtime && showDate(params.interval[1])}
				callback={callback('date')} placeholder={showDate(params.interval[1])} allowEmpty={true}/>
			<br/> Days count: 
			<ValidatedInput type='number' value={Math.round((+params.interval[1] - +params.interval[0]) / 86400000)}
				callback={callback('days')}/>
			<br/> Exclude stations: 
			<ValidatedInput type='text' value={params.exclude?.join()}
				callback={callback('exclude')} placeholder='KIEL2,IRKT'/>
			<br/> Idx window (h): 
			<ValidatedInput type='number' value={params.window}
				callback={callback('window')}/>
			<br/> Idx threshold: 
			<ValidatedInput type='number' value={params.minamp}
				callback={callback('minamp')}/>
			<br/> Draw onset: 
			<ValidatedInput type='time' value={params.onsets?.[0] && showDate(params.onsets[0].time)}
				callback={callback('onset')} allowEmpty={true}/>

		</div>
	);
}

export default function PlotCirclesStandalone() {
	const [settingsOpen, setOpen] = useState(false);

	const [params, setParams] = useState<CirclesParams>(() => {
		const stored = window.localStorage.getItem('plotRefParams');
		setTimeout(() => window.localStorage.removeItem('plotRefParams'));
		const referred = stored && JSON.parse(stored);
		if (referred)
			referred.interval = referred.interval.map((d: any) => new Date(d));
		if (referred?.onset)
			referred.onset = new Date(referred.onset);
		return {
			...(referred || {
				interval: [
					new Date(Math.floor(Date.now() / 36e5) * 36e5 - 5 * 864e5),
					new Date(Math.floor(Date.now() / 36e5) * 36e5) ],
				realtime: true,
				window: 3,
				minamp: .7
			}),
			interactive: true
		};
	});

	useEventListener('visibilitychange', () => {
		if (document.hidden) return;
		setParams(para => {
			if (!para.realtime) return para;
			const diff = para.interval[1].getTime() - para.interval[0].getTime();
			const now = Math.floor(Date.now() / 36e5) * 36e5;
			return { ...para, interval: [new Date(now - diff), new Date(now)] };
		});
	});

	return (
		<div style={{ position: 'relative', height: '98vh', width: '100vw' }}>
			{settingsOpen && <CirclesParamsInput {...{ params, setParams }}/>}
			<PlotCircles {...{ params, settingsOpen }}/>
			<button className='Button' style={{ bottom: 0, left: 10, ...(settingsOpen && { color: 'var(--color-active)' }) }}
				onClick={() => setOpen(o => !o)}>S</button>
		</div>
	);
}