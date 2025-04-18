import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { apiGet, useEventListener, useSize } from '../../util';
import { circlesSizeComputer, circlePaths, linePaths, pointPaths } from '../plotPaths';
import { applyOverrides, axisDefaults, color, customTimeSplits,
	drawMagneticClouds, drawOnsets, drawShape, font, getFontSize, markersPaths, scaled, 
	usePlotOverlay, withOverrides, type PlotOverlayHandle } from '../plotUtil';
import { type BasicPlotParams, applyTextTransform } from '../basicPlot';
import { useQuery } from 'react-query';
import { Quadtree } from '../quadtree';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';

import 'uplot/dist/uPlot.min.css';
import '../../styles/Circles.css';
import { usePlotParams, type Onset } from '../../events/events';
import { themeOptions } from '../../app';
import { ExportableUplot } from '../../events/ExportPlot';
import { ValidatedInput } from '../../Utility';
import type { ContextMenuProps } from '../../layout';

const defaultParams = {
	rsmExtended: false,
	exclude: [] as string[],
	window: 3,
	variationShift: undefined as undefined | number,
	sizeShift: undefined as undefined | number,
	autoFilter: true,
	fixAmplitudeScale: true,
	linearSize: false,
	showPrecursorIndex: true
};

export type CirclesParams = typeof defaultParams & {
	theme?: string,
	realtime?: boolean,
	base?: Date,
};

type CirclesPlotParams = BasicPlotParams & CirclesParams;

type CirclesResponse = {
	base: number,
	time: number[],
	variation: (number | null)[][],
	shift: number[],
	station: string[],
	a0r: number[],
	a0m: null | number[], 
	precursor_idx: number[], // eslint-disable-line camelcase
	filtered: number,
	excluded: string[]
};

type CirclesMomentResponse = {
	time: number,
	x: number[],
	y: number[],
	fnx?: number[],
	fny?: number[],
	fny2?: number[],
	index?: number,
	a1?: number,
	a2?: number
};

const [POS_S, NEG_S] = [6, 8];

function drawCirclesLegend({ params, overlayHandle: { size, position, defaultPos }, plotData }:
{ params: BasicPlotParams, overlayHandle: PlotOverlayHandle, plotData: any }) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		if (!params.showLegend) return;
		const px = (a: number) => scaled(a * devicePixelRatio);

		const pos = position.current ?? defaultPos(u, size.current);

		const x = scaled(pos.x);
		let y = scaled(pos.y);
		const ctx = u.ctx;
		ctx.save();
		ctx.font = font();

		const szCompPos = circlesSizeComputer(u, params, plotData[1][2], POS_S);
		const szCompNeg = circlesSizeComputer(u, params, plotData[2][2], NEG_S);
		const szComp = (v: number) => v > 0 ? szCompPos(v) : szCompNeg(v);

		const vars = [-5, -2, -1, 2];
		const sizes = vars.map(szComp);

		const szMax = sizes[0];
		const width = szMax + ctx.measureText('−3 %').width + px(12);
		const height = sizes.reduce((a, b) => a + (Math.max(getFontSize(), b))) + px(18);
		if (!captureOverrides?.scale)
			size.current = { width, height };
		
		ctx.lineWidth = px(1);
		ctx.strokeStyle = color('text-dark');
		ctx.fillStyle = color('bg');
		ctx.fillRect(x, y, width, height);
		ctx.strokeRect(x, y, width, height);
		ctx.textAlign = 'left';
		ctx.lineCap = 'butt';

		y += 0 + px(3);
		for (const [i, variation] of vars.entries()) {
			const sz = Math.max(getFontSize(), sizes[i]);
			ctx.fillStyle = color('text');
			ctx.fillText(variation.toString().replace('-', '−').padStart(2, '  ') + ' %', x + szMax + px(8), y + sz/2);
			ctx.beginPath();
			ctx.arc(x + szMax / 2 + px(4), y + sz / 2, sizes[i] / 2, 0, Math.PI * 2);
			ctx.fillStyle = color(variation > 0 ? 'cyan2' : 'magenta2');
			ctx.strokeStyle = color(variation > 0 ? 'cyan' : 'magenta');
			ctx.stroke();
			ctx.fill();
			y += sz + px(4);
		}
		u.ctx.stroke();

		u.ctx.restore();

	}, captureOverrides);

}

function Menu({ params, Checkbox, setParams }: ContextMenuProps<CirclesParams>) {
	return <div className='Group'>
		<div>Exclude:<input type='text' style={{ marginLeft: 4, width: '10em', padding: 0 }}
			defaultValue={params.exclude?.join(',') ?? ''}
			onChange={e => JSON.stringify(e.target.value.split(/\s*,\s*/g).filter(s => s.length>3)) !== JSON.stringify(params.exclude)
				&& setParams({ exclude: e.target.value.split(/\s*,\s*/g).filter(s => s.length>3) })}/></div>
		<div className='Row'>
			<Checkbox text='Filter' k='autoFilter'/>
			<Checkbox text='Linear size' k='linearSize'/>
		</div> <div className='Row'>
			<Checkbox text='Extended plot' k='rsmExtended'/>
			<Checkbox text='pIndex' k='showPrecursorIndex'/>
		</div> <div className='Row'>
			<input style={{ width: '6em' }}
				type='number' min='-99' max='99' step='.05' value={params.variationShift?.toFixed(2) ?? ''} placeholder='shift'
				onChange={e => setParams({ variationShift:
					(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber })}></input>
			<input style={{ width: '6em' }}
				type='number' min='-200' max='200' step='2' value={params.sizeShift?.toFixed(0) ?? ''} placeholder='size'
				onChange={e => setParams({ sizeShift:
					(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber })}></input>
		</div>
	</div>;
}

const LEGEND_H = 32;
function PlotCircles({ params: initParams, settingsOpen }: { params: CirclesPlotParams, settingsOpen?: boolean }) {
	// const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const container = useRef<HTMLDivElement>(null);
	const size = useSize(container.current?.parentElement);

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6, 
		y: u.bbox.top / scaled(1)
	}));

	const params = useMemo(() => ({ ...initParams }), [initParams]) as CirclesPlotParams;
	const { rsmExtended: twoPlots, interactive } = params;
	let padRight = 64;
	if (params.stretch && size.width) {
		// tweak interval so that time axis would align with other (shorter) plots
		const initialInterval = initParams.interval;
		const even = initialInterval[1].getTime() % 36e5 === 0 ? 1 : 0;
		const len = Math.ceil((initialInterval[1].getTime() - initialInterval[0].getTime()) / 36e5) + even;
		const pwidth = size.width - 64;
		const targetHourWidth = (pwidth - padRight) / len;
		const addHoursRight = Math.floor(padRight / targetHourWidth) - 1 + even;
		padRight = padRight % targetHourWidth;
		params.interval = [
			new Date(initialInterval[0].getTime() + 36e5 * (1 - even)),
			new Date(initialInterval[1].getTime() + 36e5 * addHoursRight)
		];
	}

	const [ idxEnabled, setIdxEnabled ] = useState(true);
	const [ base, setBase ] = useState(params.base);

	useEffect(() => { setBase(params.base) }, [params.base])

	const [ moment, setMoment ] = useState<number | null>(null);
	
	const query = useQuery({
		queryKey: ['ros', params.interval, params.exclude, params.window, params.autoFilter, base],
		queryFn: () => (!params.stretch || size.width) ? fetchCircles<CirclesResponse>(params, base) : null,
		keepPreviousData: interactive
	});

	const [ uplot, setUplot ] = useState<uPlot>();
	const [ uplot2, setUplot2 ] = useState<uPlot>();
	const plotData = useMemo(() => {
		if (!query.data) return null;
		return renderPlotData(query.data, params.variationShift);
	}, [query.data, params.variationShift]);

	const [ iis, iie ] = params.interval.map(d => d.getTime());
	useEffect(() => setMoment(null), [iis, iie]);

	const plotSize = useCallback((i: 0 | 1) => (sz: typeof size, unknown?: boolean) =>
		({ ...(unknown ? size : sz), height: (unknown ? size : sz).height * (twoPlots ? i > 0 ? .3 : .7 : 1) - (interactive ? LEGEND_H : 0) }), [interactive, twoPlots, size]);

	useLayoutEffect(() => {
		if (uplot) uplot.setSize(plotSize(0)(size));
		if (uplot2) uplot2.setSize(plotSize(1)(size));
	}, [uplot, uplot2, size, plotSize]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (!interactive) return;
		if (e.target instanceof HTMLInputElement) return;
		if (e.code === 'Escape') setMoment(() => null);
		const move = { ArrowLeft: -3600, ArrowRight: 3600 }[e.code];
		if (!move) return;
		const [ min, max ] = params.interval.map(d => Math.ceil(d.getTime() / 36e5) * 3600);
		setMoment(mm => mm && Math.min(Math.max(mm + move, min), max));
	});

	const plotComponent = useMemo(() => {
		if (!plotData || !container.current || size.height <= 0) return null;
		const data = query.data!;

		let qt: Quadtree;
		let hoveredRect: { sidx: number, didx: number, w: number } | null = null;
		const legendValue = (seriesIdx: number) => (u: uPlot) => {
			if (u.data == null || seriesIdx !== hoveredRect?.sidx)
				return '';
			const d = u.data[hoveredRect.sidx] as any;
			if (hoveredRect.didx >= d[0].length) 
				return '';
			const stIdx = d[3][hoveredRect.didx], lon = d[1][hoveredRect.didx].toFixed(2);
			const time = new Date(d[0][hoveredRect.didx] * 1000).toISOString().replace(/\..*|T/g, ' ');
			return `[ ${data.station[stIdx]} ] v = ${d[2][hoveredRect.didx].toFixed(2)}%, aLon = ${lon}, time = ${time}`;
		};
		const setSelect = (u: uPlot, val: number) => u.setSelect({
			left: u.valToPos(val, 'x'),
			top: 0,
			width: u.valToPos(val + 86400, 'x') - u.valToPos(val, 'x'),
			height: u.over.offsetHeight
		});

		const options: () => uPlot.Options = () => ({
			padding: [scaled(8), params.interactive ? scaled(12) : padRight, 0, 0],
			...plotSize(0)(size),
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
							return hoveredRect && seriesIdx === hoveredRect.sidx ? (hoveredRect.w + 1) / devicePixelRatio : 0;
						}
					}
				})
			},
			hooks: {
				setSeries: [
					(u, sIdx) => {
						if (sIdx !== 3) return;
						setIdxEnabled(u.series[3].show!);
					}
				],
				drawClear: [
					u => {
						setSelect(u, data.base);
						u.setCursor({ left: -1, top: -1 });
						qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
						qt.clear();
						u.series.forEach((s, i) => {
							if (i > 0) (s as any)._paths = null;
						});
					},
				],
				draw: [
					u => {
						if (!moment) return;
						const x = u.valToPos(moment, 'x', true);
						const y = u.bbox.height;
						u.ctx.save();
						u.ctx.beginPath();
						u.ctx.strokeStyle = color('green');
						u.ctx.lineWidth = scaled(2);
						drawShape(u.ctx, scaled(6) * devicePixelRatio)['triangleUp'](x, y + scaled(14) * devicePixelRatio);
						u.ctx.stroke();
						u.ctx.restore();
					},
					drawMagneticClouds(params),
					drawOnsets(params),
					drawCirclesLegend({ params, overlayHandle, plotData }),
				],
				ready: [
					overlayHandle.onReady,
					u => {
						if (interactive)
							u.over.style.setProperty('cursor', 'pointer');
						let currentBase = data.base;
						setSelect(u, currentBase);
						let isDragged: boolean, clickX: number | undefined, clickY: number | undefined;
						u.over.addEventListener('mousemove', e => {
							if (isDragged) {
								const dragValue = u.posToVal(e.offsetX, 'x') - u.posToVal(clickX!, 'x');
								currentBase = Math.round((data.base + dragValue) / 3600) * 3600;
								if (currentBase < u.scales.x.min!)
									currentBase = u.scales.x.min!;
								if (currentBase > u.scales.x.max! - 86400)
									currentBase = u.scales.x.max! - 86400;
							}
							setSelect(u, currentBase);
						});
						u.over.addEventListener('mousedown', e => {
							clickX = e.offsetX;
							clickY = e.offsetY;
							isDragged = u.valToPos(data.base, 'x') < clickX && clickX < u.valToPos(data.base + 86400, 'x');
							setSelect(u, currentBase);
						});
						u.over.addEventListener('mouseup', e => {
							if (currentBase !== data.base) {
								setBase(new Date(currentBase * 1e3));
							} else if (interactive && (u.cursor.left ?? 0) > 0 && Math.abs(e.offsetX - clickX!) + Math.abs(e.offsetY - clickY!) < 30) {
								const detailsIdx = u.posToIdx(u.cursor.left!);
								if (detailsIdx != null)
									setMoment(data.time[detailsIdx]);
							}
							isDragged = false;
							clickX = clickY = undefined;
						});
					}
				]
			},
			axes: [
				{
					...axisDefaults(params.showGrid),
					...customTimeSplits(params),
				},
				{
					...axisDefaults(params.showGrid),
					ticks: { ...axisDefaults(params.showGrid).ticks, size: 4 },
					scale: 'y',
					label: applyTextTransform('effective longitude, deg'),
					values: (u, vals) => vals.map(v => v.toFixed(0)),
					space: scaled(32),
					gap: scaled(2),
					incrs: [ 30, 45, 60, 90, 180, 360 ]
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
					fill: color('cyan2'),
					value: legendValue(1),
					paths: circlePaths((rect: any) => qt.add(rect), POS_S, params)
				},
				{
					label: '-',
					facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
					stroke: color('magenta'),
					fill: color('magenta2'),
					value: legendValue(2),
					paths: circlePaths((rect: any) => qt.add(rect), NEG_S, params)
				},
				...(!twoPlots ? [{
					show: idxEnabled && (params.showPrecursorIndex ?? true),
					scale: 'idx',
					label: 'idx',
					stroke: color('gold'),
					facets: [ { scale: 'x', auto: true }, { scale: 'idx', auto: true } ],
					value: (u, v, si, di) => (u.data as any)[3][1][di!] || 'NaN',
					paths: linePaths(scaled(1.75))
				} as uPlot.Series] : [])
			]
		});
		return <>
			<ExportableUplot {...{ size: plotSize(0), options, data: plotData as any, onCreate: setUplot }}/>
			{twoPlots && <UplotReact {...{ options: {
				tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'UTC'),
				cursor: { show: interactive, drag: { setScale: false } },
				legend: { show: interactive },
				padding: [8, 12, 0, 0],
				...plotSize(1)(size),
				scales: {
					a0: {
						range: (u, min, max) => [min-.5, max+.5]
					},
					idx: {
						range: (u, min, max) => [-.1, Math.max(6, max * 1.2)]
					}
				},
				axes: [{
					...axisDefaults(true),
					...customTimeSplits(params),
					size: 8,
				}, {
					...axisDefaults(true),
					incrs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20],
					label: 'variation, %',
					labelSize: 20,
					size: 44,
					gap: 8,
					scale: 'a0',
				}, {
					scale: 'idx',
					show: false
				}],
				series: [{
					value: '{YYYY}-{MM}-{DD} {HH}:{mm}', label: 't', stroke: color('text')
				}, {
					label: 'idx',
					scale: 'idx',
					points: { show: false },
					value: (u, val) => val !== null ? val?.toString() : u.cursor.idx != null ? 'NaN' : '--',
					stroke: color('acid')
				}, {
					show: data.a0m != null,
					label: 'A0m',
					scale: 'a0',
					points: { show: false },
					value: (u, val) => data.a0m != null && val !== null ? val?.toString() + ' %' : '--',
					stroke: color('magenta')
				}, {
					label: 'A0r',
					scale: 'a0',
					width: 2,
					value: (u, val) => val !== null ? val?.toString() + ' %' : '--',
					stroke: color('purple'),
					points: {
						show: true,
						stroke: color('purple'),
						fill: color('purple'),
						width: 0,
						paths: markersPaths('diamond', 9) as any
					},
				}]
			}, data: [data.time, data.precursor_idx, data.a0m ?? [], data.a0r] as any,
			onCreate: setUplot2 }}/>}
		</>;
	}, [twoPlots, interactive, plotData, moment, container, size.height <= 0, initParams, padRight, idxEnabled, setIdxEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

	return <div ref={container}>
		{query.isLoading && <div className='Center'>LOADING...</div>}
		{query.isError && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}
		{/* {size.width && query.isFetched && !query.data && <div className='Center'>LACKING DATA...</div>} */}
		{query.data && <div style={{ position: 'absolute' }}>
			{plotComponent}
			{moment && <PlotCirclesMoment {...{ params, data: query.data, base, moment, setMoment, settingsOpen }}/>}
			{interactive && <div style={{ position: 'absolute', color: 'var(--color-text-dark)', right: 16, bottom: 6 }}>
				{query.isFetching ? 'Fetching...' : (
					(query.data.excluded?.length ? 'Excluded: ' + query.data.excluded.join() : '') +
					(query.data.filtered ? ' Filtered: ' + query.data.filtered : '')
				)}
			</div>}
		</div>}

	</div>;
}

function circlesMomentPlotOptions(params: CirclesParams, allData: CirclesResponse, data: CirclesMomentResponse): uPlot.Options {
	const moment = new Date(data.time * 1000).toISOString().replace(/\..*|T/g, ' ');
	const scaleRange = params.fixAmplitudeScale && [
		Math.min.apply(null, allData.variation.flat() as any),
		Math.max.apply(null, allData.variation.flat() as any),
	];
	return {
		title: `[ ${moment}] a1=${data.a1?.toFixed(2) ?? 'N/A'} a2=${data.a2?.toFixed(2) ?? 'N/A'}`,
		width: 480 / devicePixelRatio,
		height: 480 / devicePixelRatio - 32,
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
				...axisDefaults(true),
				size: 36,
				space: 36,
				values: (u, vals) => vals.map(v => v.toFixed(0)),
				incrs: Array(360 / 45).fill(1).map((a,  i) => i * 45)
			},
			{
				...axisDefaults(true),
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
				range: (u, min, max) => scaleRange as any || [min, max],
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
			},
			{
				stroke: color('green'),
				paths: linePaths(2)
			}
		]
	};
}

async function fetchCircles<T extends CirclesMomentResponse | CirclesResponse>(params: CirclesPlotParams, base?: Date, moment?: number) {
	try {
		const res = await apiGet('cream/ros', {
			from: (params.interval[0].getTime() / 1000).toFixed(0),
			to:   (params.interval[1].getTime() / 1000).toFixed(0),
			...(moment && { details: moment.toFixed(0) }),
			...(base && { base: (base.getTime() / 1000).toFixed(0) }),
			...(params.exclude && { exclude: params.exclude.join() }),
			...(params.window && { window: params.window.toString() }),
			autoFilter: (params.autoFilter ?? true).toString()
		});
		return res as T;
	} catch(e) {
		return null;
	}
}

function renderPlotData(resp: CirclesResponse, shift?: number) {
	const slen = resp.shift.length, tlen = resp.time.length;
	if (tlen < 10) return;
	const data = Array.from(Array(4), () => new Array(slen*tlen));
	let posCount = 0, nullCount = 0;
	for (let ti = 0; ti < tlen; ++ti) {
		for (let si = 0; si < slen; ++si) {
			const time = resp.time[ti];
			const rawv = resp.variation[ti][si];
			const vv = rawv != null ? rawv + (shift ?? 0) : null;
			const idx = ti*slen + si;
			// if (vv < maxVar) maxVar = vv;
			if (vv == null) ++nullCount;
			else if (vv >= 0) ++posCount;
			data[0][idx] = time;
			data[1][idx] = (360 + time % 86400 / 86400 * 360 + resp.shift[si]) % 360;
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
	console.log('circles data', resp, [ resp.time, pdata, ndata, resp.a0r, resp.precursor_idx ]);
	return [ resp.time, pdata, ndata, [resp.time, resp.precursor_idx] ];
}

function PlotCirclesMoment({ params, data: allData, base, moment, setMoment, settingsOpen }:
{ params: CirclesPlotParams, data: CirclesResponse, base?: Date, moment: number, setMoment: (m: number | null) => void, settingsOpen?: boolean }) {
	const query = useQuery({
		staleTime: 0,
		keepPreviousData: true,
		queryKey: ['rosMoment', JSON.stringify(params.interval), params.exclude, params.window, params.autoFilter, base, moment],
		queryFn: () => fetchCircles<CirclesMomentResponse>(params, base, moment),
	});

	const plot = useMemo(() => {
		if (!query.data?.time) return null;
		const options = circlesMomentPlotOptions(params, allData, query.data);
		const data = [[], [query.data.x, query.data.y],
			[query.data.fnx ?? [], query.data.fny ?? []],
			[query.data.fnx ?? [], query.data.fny2 ?? []]] as any;
		return <UplotReact {...{ options, data }}/>;
	}, [params, allData, query.data]);

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

function CirclesParamsInput({ params, setParams }:
{ params: CirclesPlotParams, setParams: (p: CirclesPlotParams) => void  }) {
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
	
	const Checkbox = ({ text, k }: { text: string, k: keyof CirclesParams }) =>
		<label style={{ cursor: 'pointer', userSelect: 'none' }}>{text}
			<input type='checkbox' style={{ marginLeft: 4 }} checked={!!params[k]}
				onChange={e => callback(k)(e.target.checked)}/></label>;
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
			<br/> Draw onset: 
			<ValidatedInput type='time' value={params.onsets?.[0] && showDate(params.onsets[0].time)}
				callback={callback('onset')} allowEmpty={true}/>
			<br/> Theme: <select value={params.theme || 'Dark'} onChange={e => callback('theme')(e.target.value)}>
				{themeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
			</select>
			<div style={{ lineHeight: '2em' }}>
				<Checkbox text='Automatic filtering' k='autoFilter'/>
				<br/><Checkbox text='Fix amplitude scale' k='fixAmplitudeScale'/>
				<br/><Checkbox text='Linear size scaling' k='linearSize'/>
				<br/><Checkbox text='Show second plot' k='rsmExtended'/>
			</div>

		</div>
	);
}

export function PlotCirclesStandalone() {
	const [settingsOpen, setOpen] = useState(false);

	const [params, setParams] = useState<CirclesPlotParams>(() => {
		const stored = window.localStorage.getItem('plotRefParams');
		setTimeout(() => window.localStorage.removeItem('plotRefParams'));
		const referred = stored && JSON.parse(stored);
		const filtered: Partial<BasicPlotParams> = {
			showMetaInfo: referred?.showMetaInfo,
			showMetaLabels: referred?.showMetaLabels,
			showEventsEnds: referred?.showEventsEnds,
		};
		if (referred)
			filtered.interval = referred.interval.map((d: any) => new Date(d));
		if (referred?.onsets)
			filtered.onsets = referred.onsets.map((o: any) => ({ ...o, time: new Date(o.time) }));
		if (referred?.clouds)
			filtered.clouds = referred.clouds.map((c: any) => ({ start: new Date(c.start), end: new Date(c.end) }));
		return {
			rsmExtended: false,
			stretch: false,
			interactive: true,
			autoFilter: true,
			showTimeAxis: true,
			...(referred ? filtered : {
				interval: [
					new Date(Math.floor(Date.now() / 36e5) * 36e5 - 5 * 864e5),
					new Date(Math.floor(Date.now() / 36e5) * 36e5) ],
				realtime: true,
				window: 3,
			})
		} as CirclesPlotParams;
	});

	if (params.theme)
		document.documentElement.setAttribute('main-theme', params.theme);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code !== 'KeyT' || e.target instanceof HTMLInputElement) return;
		const theme = params.theme ?? 'Dark';
		setParams({ ...params, theme: themeOptions[(themeOptions.indexOf(theme as any) + 1) % 3] });
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
			<button className='Button' style={{ bottom: 0, lineHeight: 1, left: 10, ...(settingsOpen && { color: 'var(--color-active)' }) }}
				onClick={() => setOpen(o => !o)}>S</button>
			<input style={{ position: 'absolute', fontSize: 15, bottom: 0, left: 46, width: '5em', borderRadius: 6 }}
				type='number' min='-9' max='9' step='.05' value={params.variationShift?.toFixed(2) ?? ''} placeholder='shift'
				onChange={e => setParams(para => ({ ...para, variationShift:
					(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber }))}></input>
			<input style={{ position: 'absolute', fontSize: 15, bottom: 0, left: 46 + 80, width: '5em', borderRadius: 6 }}
				type='number' min='-99' max='99' step='1' value={params.sizeShift?.toFixed(0) ?? ''} placeholder='size'
				onChange={e => setParams(para => ({ ...para, sizeShift:
					(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber }))}></input>
		</div>
	);
}

function Panel() {
	const params = usePlotParams<CirclesPlotParams>();

	return <>
		<PlotCircles params={params}/>
		<a style={{ backgroundColor: 'var(--color-bg)', position: 'absolute', top: 0, right: 4 }}
					href='./ros' target='_blank' onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>
	</>;
}

export const RSMPlot = {
	name: 'Ring of Stations',
	Panel,
	Menu,
	defaultParams,
	isPlot: true
};