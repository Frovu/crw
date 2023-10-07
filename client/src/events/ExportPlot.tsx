import {  ChangeEvent, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clamp, dispatchCustomEvent, useEventListener, usePersistedState } from '../util';
import PlotSW, { SWParams } from '../plots/time/SW';
import PlotIMF, { IMFParams } from '../plots/time/IMF';
import PlotGSM, { GSMParams } from '../plots/time/GSM';
import PlotGeoMagn, { GeomagnParams } from '../plots/time/Geomagn';
import PlotCircles, { CirclesParams } from '../plots/time/Circles';
import { BasicPlotParams, PlotsOverrides, Position, ScaleParams, TextTransform, color, withOverrides } from '../plots/plotUtil';
import { PlotContext, plotPanelOptions } from './events';
import { themeOptions } from '../app';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { LayoutContext, gapSize, useLayoutsStore } from '../Layout';
import { persist } from 'zustand/middleware';

const trivialPlots = ['Solar Wind', 'SW Plasma', 'Cosmic Rays', 'CR Anisotropy', 'Geomagn', 'Ring of Stations'] as const;

type PlotSettings = {
	type: typeof trivialPlots[number],
	height: number,
	showTime: boolean,
	showMeta: boolean,
	id: number
};

type TranformEntry = TextTransform & { id: number };
type PlotExportSettings = {
	plotParams: Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams, 'interval'|'showTimeAxis'|'showMetaInfo'|'transformText'>,
	theme: typeof themeOptions[number],
	showClouds: boolean,
	width: number,
	plots: PlotSettings[],
	transformText: TranformEntry[],
};

const defaultSettings = (): PlotExportSettings => ({
	plotParams: {
		useAp: false,
		showGrid: true,
		showMarkers: true,
		showLegend: true,
		showAz: false,
		showAxy: true,
		showAxyVector: false,
		showBxBy: false,
		showBz: true,
		useA0m: true,
		subtractTrend: true,
		maskGLE: true,
		useTemperatureIndex: true,
		showPrecursorIndex: true,
		showBeta: true,
		overrideScales: {},
	},
	showClouds: true,
	theme: 'Dark',
	width: 640,
	transformText: [],
	plots: [{
		type: 'Solar Wind',
		height: 200,
		showTime: true,
		showMeta: true,
		id: 0,
	}, {
		type: 'Cosmic Rays',
		height: 200,
		showTime: true,
		showMeta: true,
		id: 1,
	}, {
		type: 'Geomagn',
		height: 100,
		showTime: false,
		showMeta: true,
		id: 2,
	}, {
		type: 'Ring of Stations',
		height: 300,
		showTime: true,
		showMeta: true,
		id: 3,
	}]
});

type PlotEntryParams = {
	options: () => uPlot.Options,
	data: (number | null)[][]
};

type PlotExportState = {
	inches: number,
	overrides: PlotsOverrides,
	plots: {
		[nodeId: string]: PlotEntryParams,
	},
	set: <T extends keyof PlotsOverrides>(k: T, v: PlotsOverrides[T]) => void,
	setInches: (v: number) => void,
};

export const usePlotExportSate = create<PlotExportState>()(persist(immer(set => ({
	inches: 12 / 2.54,
	overrides: {
		scale: 2,
		fontSize: 14
	},
	plots: {},
	set: (k, v) => set(state => { state.overrides[k] = v; }),
	setInches: (v) => set(state => { state.inches = v; })
})), {
	name: 'plotsExportState',
	partialize: ({ overrides, inches }) => ({ overrides, inches })
}));

function computePlotsLayout() {
	const { active, list } = useLayoutsStore.getState();
	const { tree, items } = list[active];

	const root = document.getElementById('layoutRoot')!;

	const layout: { [k: string]: { x: number, y: number, w: number, h: number } } = {};
	const walk = (x: number, y: number, w: number, h: number, node: string='root') => {
		if (!tree[node]) {
			if (plotPanelOptions.includes(items[node]?.type as any))
				layout[node] = { x, y, w: Math.floor(w), h: Math.floor(h) };
			return;
		}
		const { split, ratio, children } = tree[node]!;
		const splitX = Math.floor(split === 'row' ? w * ratio - gapSize / 2 : 0);
		const splitY = Math.floor(split === 'column' ? h * ratio - gapSize / 2 : 0);
		const gapX = splitX && gapSize, gapY = splitY && gapSize; 
		walk(x, y, splitX || w, splitY || h, children[0]);
		walk(x + splitX, y + splitY, w - splitX - gapX, h - splitY - gapY, children[1]);
	};
	walk(0, 0, root?.offsetWidth, root?.offsetHeight);

	const [minX, minY] = (['x', 'y'] as const).map(d =>
		Math.min.apply(null, Object.values(layout).map(pos => pos[d])));
	const [maxX, maxY] = (['x', 'y'] as const).map(d =>
		Math.max.apply(null, Object.values(layout).map(pos => pos[d] + pos[d === 'x' ? 'w' : 'h'])));

	for (const node in layout) {
		layout[node].x -= minX;
		layout[node].y -= minY;
	}

	return {
		width: Math.ceil(maxX - minX),
		height: Math.ceil(maxY - minY),
		layout
	};
}

async function doRenderPlots() {
	const { width, height, layout } = computePlotsLayout();
	const { plots, overrides } = usePlotExportSate.getState();
	const { scale } = overrides;
	const canvas = document.createElement('canvas');
	canvas.width = width * scale * devicePixelRatio;
	canvas.height = height * scale * devicePixelRatio;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = color('bg');
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (const [nodeId, node] of Object.entries(layout)) {
		const [x, y, w, h] = (['x', 'y', 'w', 'h'] as const).map(d => scale * node[d]);
		if (!plots[nodeId]) continue;
		const { options, data } = plots[nodeId];
		const opts = {
			...withOverrides(options, overrides),
			width: Math.round(w),
			height: Math.round(h),
		};
		const upl: uPlot = await new Promise(resolve => new uPlot(opts, data as any, (u, init) => {
			init();
			resolve(u);
		}));
		ctx.drawImage(upl.ctx.canvas, Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio));
		// ctx.strokeStyle = 'cyan';
		// ctx.strokeRect(x, y, w, h);
		upl.destroy();
	}
	return canvas;
}

async function doExportPlots(download: boolean=false) {
	const canvas = await doRenderPlots();

	if (download) {
		const a = document.createElement('a');
		a.download = 'feid_compound_plot.png';
		a.href = canvas.toDataURL()!;
		return a.click();
	}
	canvas.toBlob(blob => {
		blob && window.open(URL.createObjectURL(blob));
	});
}

export function ExportControls() {
	const { inches, overrides: { scale, fontSize, fontFamily }, setInches, set } = usePlotExportSate();
	const { width, height } = computePlotsLayout();
	const [useCm, setUseCm] = useState(true);

	return <div style={{ padding: 4, fontSize: 14 }}>
		<div style={{ display: 'flex', gap: 4, color: color('white') }}>
			<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots()}>Open png</button>
			<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots(true)}>Download</button>
		</div>
		{devicePixelRatio !== 1 && <div style={{ fontSize: 12, color: color('red') }}>pixelRatio ({devicePixelRatio.toFixed(2)}) != 1,
		export won't work as expected, press Ctrl+0 if it helps</div>}
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 4 }}>
			<span><label>Font<input style={{ width: 42, margin: '0 4px' }} type='number' min='6' max='42'
				value={fontSize} onChange={e => set('fontSize', e.target.valueAsNumber)}/>pt</label>
			<input type='text' style={{ marginLeft: 4, width: 120 }} placeholder='Roboto Mono'
				value={fontFamily} onChange={e => set('fontFamily', e.target.value || undefined)}/></span>
			<span><label>Size<input style={{ width: 56, marginLeft: 4 }} type='number' min='0' max='100' step={useCm ? .5 : .25}
				value={Math.round(inches * (useCm ? 2.54 : 1) / .25) * .25} onChange={e => setInches(e.target.valueAsNumber / (useCm ? 2.54 : 1))}/></label>
			<label style={{ padding: '0 4px' }}>{useCm ? 'cm' : 'in'}
				<input hidden type='checkbox' checked={useCm} onChange={(e) => setUseCm(e.target.checked)}/></label>,
			<label style={{ paddingLeft: 4 }} title='Approximate resolution when shrinked to specified size'>Res: 
				<select style={{ marginLeft: 2, width: 86 }} value={scale} onChange={e => set('scale', e.target.value as any)}>
					{[2,3,4,6,8,10].map(scl => <option key={scl} value={scl}>{(width * scl / inches).toFixed()} dpi</option>)}
				</select></label>
			</span>
			<div style={{ color: color('text-dark') }}>image: {width*scale} x {height*scale}px, ≈ {(width * height * .74 * (scale - 1.2) / 1024 / 1024).toFixed(2)} MB</div>
			
		</div>
	</div>;
}

export function ExportPreview() {
	const expState = usePlotExportSate();
	const { overrides: { scale } } = expState;
	const context = useContext(LayoutContext)!;
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [show, setShow] = useState(false);
	const [renderTime, setTime] = useState<number | null>(null);

	const width = show ? computePlotsLayout().width : 1;
	useEffect(() => {
		if (!show || !container) return;
		const time = Date.now();
		doRenderPlots().then(can => {
			container?.replaceChildren(can);
			setTime(Date.now() - time);
		});
	}, [container, context, show, expState]);

	return <div style={{ padding: 2, height: '100%' }} onClick={() => setShow(!show)}>
		<span style={{ padding: 2 }}>preview plots (may be slow) <input type='checkbox' checked={show} readOnly/></span>
		{show && renderTime && <div style={{ position: 'absolute', fontSize: 14, color: color('text-dark'), bottom: 4, right: 4 }}>Rendered in {renderTime.toFixed()} ms</div>}
		<div ref={setContainer} style={{ display: !show ? 'none' : 'block',
			transform: `scale(${(context.size.width - 4) / width / scale})`, transformOrigin: 'top left' }}/>
	</div>;
}

export function ExportableUplot({ options, data, onCreate }: { options: () => uPlot.Options, data: (number | null)[][], onCreate?: (u: uPlot) => void }) {
	const layout = useContext(LayoutContext);
	const plot = useMemo(() => <UplotReact {...{ options: options(), data: data as any, onCreate: u => {
		if (layout?.id) queueMicrotask(() => usePlotExportSate.setState(state => {
			state.plots[layout.id] = { options, data }; }));
		onCreate?.(u);
	} }}/>, [options, data, layout?.id, onCreate]); // eslint-disable-line
	return plot;
}

export default function PlotExportView({ escape }: { escape: () => void }) {
	const plotContext = useContext(PlotContext);
	const [settings, setSettings] = usePersistedState('aidPlotExport', defaultSettings);
	const dragRef = useRef<Position | null>(null);
	const divRef = useRef<HTMLDivElement>(null);
	const [scaleDown, setScaleDown] = useState(false);
	const [shiftLeft, setLeft] = useState(0);
	const [shiftRight, setRight] = useState(0);
	const [autoScales, setScales] = useState<{ [scale: string]: ScaleParams }>({});

	document.documentElement.setAttribute('main-theme', settings.theme);

	const set = <T extends keyof PlotExportSettings>(what: T, val: PlotExportSettings[T]) => setSettings(st => ({ ...st, [what]: val }));
	const setParam = <T extends keyof PlotExportSettings['plotParams']>(what: T, val: PlotExportSettings['plotParams'][T]) =>
		setSettings(st => ({ ...st, plotParams: { ...st.plotParams, [what]: val } }));
	const setPlot = <T extends keyof PlotSettings>(id: number, k: T, v: PlotSettings[T]) =>
		setSettings(st => ({ ...st, plots: st.plots.map(p => p.id === id ? ({ ...p, [k]: v }) : p) }));
	const setTransform = (id: number, v: Partial<TranformEntry>) =>
		setSettings(st => ({ ...st, transformText: st.transformText.map(t => t.id === id ? ({ ...t, ...v }) : t) }));

	const container = useRef<HTMLDivElement>(null);

	const doExport = (download?: boolean) => {
		const canvas = document.createElement('canvas');
		canvas.width = settings.width;
		canvas.height = settings.plots.reduce((s, a) => s + a.height, 0);
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = color('bg');
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		let y = 0;
		settings.plots.forEach((plot, i) => {
			const nodes = container.current!.children[i].querySelectorAll('canvas');
			for (const can of nodes) {
				ctx.drawImage(can, 0, y + (can.offsetParent as HTMLDivElement)?.offsetTop ?? 0);
			}
			y += plot.height;
		});

		if (download) {
			const a = document.createElement('a');
			a.download = 'aid_compound_plot.png';
			a.href = canvas.toDataURL()!;
			return a.click();
		}
		
		canvas.toBlob(blob => {
			blob && window.open(URL.createObjectURL(blob));
		});
	};

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.target instanceof HTMLInputElement)
			return;
		if (['Escape', 'KeyE', 'KeyH'].includes(e.code))
			escape();
		else if ('KeyT' === e.code)
			setSettings(st => ({ ...st, theme: themeOptions[(themeOptions.indexOf(st.theme) + 1) % themeOptions.length] }));
		else if ('KeyO' === e.code)
			doExport();
		else if ('KeyD' === e.code)
			doExport(true);
		else if ('Comma' === e.code)
			dispatchCustomEvent('action+plotPrevShown');
		else if ('Period' === e.code)
			dispatchCustomEvent('action+plotNextShown');
	});

	const plotParams = useMemo(() => {
		const leftTime = plotContext!.interval[0].getTime() + shiftLeft * 36e5;
		const rightTime = plotContext!.interval[1].getTime() + shiftRight * 36e5;
		
		const params = {
			...settings.plotParams,
			transformText: settings.transformText,
			...plotContext!,
			clouds: settings.showClouds ? plotContext?.clouds : [],
			stretch: settings.plots.length < 2,
			interval: [
				new Date(leftTime),
				new Date(Math.max(leftTime + 4*36e5, rightTime))
			] as [Date, Date],
			showTimeAxis: true,
			showMetaInfo: true,
			scalesCallback: ((scale, para) => ( console.log(scale, para) as any) ||
				setScales(st => ({ ...st, [scale]: para }))) as BasicPlotParams['scalesCallback']
		};

		return settings.plots.map(({ id, height, type, showMeta, showTime }) => ({ id, height, type, params: {
			...params, showTimeAxis: showTime, showMetaInfo: showMeta
		} }));
	}, [plotContext, settings, shiftLeft, shiftRight]);

	const setOverride = (scale: string, what: 'min'|'max'|'bottom'|'top'|'active') => (e: ChangeEvent<HTMLInputElement>) => {
		const scales = settings.plotParams.overrideScales ?? {};
		if (what === 'active') {
			const { [scale]: _, ...filtered } = scales;
			const newOv = e.target.checked ? { ...filtered, [scale]: autoScales[scale] } : filtered;
			setSettings(st => ({ ...st, plotParams: { ...st.plotParams, overrideScales: newOv } }));
		} else {
			if (!scales[scale]) return;
			const val = parseFloat(e.target.value);
			if (!isNaN(val)) {
				scales[scale][what] = val; // FIXME: im lazy
				setSettings(st => ({ ...st }));
			}
		}
	};
	const effectiveScales = { ...autoScales, ...settings.plotParams.overrideScales } as { [scale: string]: ScaleParams & { active?: boolean } };
	for (const sc in settings.plotParams.overrideScales)
		effectiveScales[sc].active = true;

	function Checkbox({ text, k }: { text: string, k: keyof PlotExportSettings['plotParams'] }) {
		return <label style={{ margin: '0 6px', cursor: 'pointer' }}>{text}<input style={{ marginLeft: 4 }} type='checkbox' checked={settings.plotParams[k] as boolean} onChange={e => setParam(k, e.target.checked)}/></label>;
	}

	return (<div style={{ userSelect: 'none', padding: 8 / devicePixelRatio, display: 'grid', gridTemplateColumns: `${360 / devicePixelRatio}px auto`, height: 'calc(100vh - 16px)' }}>
		<div>
			<div style={{ position: 'fixed', width: 366, height: `calc(${100*devicePixelRatio}vh - 16px)`, left: 0, top: 0,
				transform: `scale(${1 / devicePixelRatio})`, transformOrigin: 'top left', overflowY: 'auto', overflowX: 'clip' }}>
				<div style={{ padding: '8px 0 0 8px' }}>
					<div style={{ marginBottom: 8 }}>
						<button style={{ padding: '2px 6px' }} onClick={escape}>Esc</button>
						<button style={{ padding: '2px 14px', marginLeft: 8 }}
							onClick={() => doExport()}><u>O</u>pen image</button>
						<button style={{ padding: '2px 14px', marginLeft: 10 }}
							onClick={() => doExport(true)}><u>D</u>ownload png</button>
					</div>
					<div>
						<label>Width: <input style={{ width: 64 }} type='number' min='200' max='8000' step='20'
							onWheel={(e: any) => set('width', (e.target.valueAsNumber || 0) + (e.deltaY < 0 ? 20 : -20))}
							value={settings.width} onChange={e => !isNaN(e.target.valueAsNumber) && e.target.valueAsNumber > 200 && e.target.valueAsNumber < 8000
								&& set('width', e.target.valueAsNumber)}/> px</label>
						<button style={{ marginLeft: 20, width: 100 }} onClick={() => { setSettings(defaultSettings()); }}>Reset all</button>
					</div>
					<div style={{ marginTop: 8 }}>
						<label>Theme: <select value={settings.theme} onChange={e => set('theme', e.target.value as any)}>
							{themeOptions.map(th => <option key={th} value={th}>{th}</option>)}
						</select> </label>
						<label>Scale: <input type='checkbox' checked={scaleDown} onChange={e => setScaleDown(e.target.checked)}/></label>
					</div>
				</div>
				<div ref={divRef} style={{ padding: '4px 0 8px 20px', width: 356, cursor: 'grab' }}
					onMouseMove={e => {
						if (!dragRef.current || !divRef.current) return;
						const { top } = divRef.current.getBoundingClientRect();
						const height = 34 / devicePixelRatio;
						const srcIdx = clamp(0, settings.plots.length - 1,
							Math.floor((dragRef.current.y - top - 12 / devicePixelRatio) / height));
						const trgIdx = clamp(0, settings.plots.length - 1,
							Math.floor((e.clientY - top  - 12/ devicePixelRatio) / height));
						
						if (srcIdx === trgIdx) return;
						dragRef.current = { x: e.clientX, y: e.clientY };

						const plots = settings.plots.slice();
						[plots[srcIdx], plots[trgIdx]] = [plots[trgIdx], plots[srcIdx]];
						setSettings({ ...settings, plots });
					}}
					onMouseDown={e => { dragRef.current = { x: e.clientX, y: e.clientY }; }}
					onMouseUp={() => { dragRef.current = null; }}
					onMouseLeave={() => { dragRef.current = null; }}>
					{settings.plots.map(({ type, height, id, showTime, showMeta }) => <div style={{ margin: '8px 0', position: 'relative' }} key={id}>
						<select style={{ width: 111 }} value={type} onChange={e => setPlot(id, 'type', e.target.value as any)}>
							{trivialPlots.map(ptype =>
								<option key={ptype} value={ptype}>{ptype}</option>)}
						</select>
						<label title='Plot height'> h=<input style={{ width: 56 }} type='number' min='20' max='8000' step='20'
							defaultValue={height} onChange={e => !isNaN(e.target.valueAsNumber) && e.target.valueAsNumber > 20 && e.target.valueAsNumber < 8000 &&
								setPlot(id, 'height', e.target.valueAsNumber)}></input></label>
						<label style={{ cursor: 'pointer', marginLeft: 8 }}>tm
							<input type='checkbox' checked={showTime} onChange={e => setPlot(id, 'showTime', e.target.checked)}/></label>
						<label style={{ cursor: 'pointer', marginLeft: 8 }}>e
							<input type='checkbox' checked={showMeta} onChange={e => setPlot(id, 'showMeta', e.target.checked)}/></label>
						<span style={{ position: 'absolute', marginLeft: 4, top: 1 }} className='CloseButton' onClick={() => {
							setScales({});
							set('plots', settings.plots.filter(p => p.id !== id));
						}}>&times;</span>
						<span style={{ position: 'absolute', fontSize: 22, marginLeft: 18, top: -4 }}><b>⋮</b></span>
						<span style={{ position: 'absolute', fontSize: 22, left: -20, top: -4 }}><b>⋮</b></span>
					</div> )}
					<div style={{ textAlign: 'right', marginRight: 32 }}>
						<button style={{ borderColor: 'transparent', color: color('skyblue'), cursor: 'pointer' }}
							onClick={() => set('plots', settings.plots.concat({
								height: 200,
								type: trivialPlots.find(t => !settings.plots.find(p => p.type === t)) ?? trivialPlots[0],
								showTime: true,
								showMeta: true,
								id: Date.now()
							}))}>+ <u>add new plot</u></button>
					</div>
				</div>
				<div style={{ padding: '0 0 0 24px' }}>
					<h4 style={{ margin: '-16px 0 8px 0' }}>Modify Interval</h4>
					<label style={{ marginLeft: 4 }}>Left/Right: <input style={{ width: '48px' }} type='number' min='-36' max='25' step='1'
						value={shiftLeft} onChange={e => setLeft(e.target.valueAsNumber)}/></label>
					<label> / <input style={{ width: '48px' }} type='number' min='-24' max='36' step='1'
						value={shiftRight} onChange={e => setRight(e.target.valueAsNumber)}/> hours</label>
					<h4 style={{ margin: '10px 0' }}>Global</h4>
					<div style={{ margin: '-2px 0 0 0' }}>
						<Checkbox text='Grid' k='showGrid'/>
						<Checkbox text='Markers' k='showMarkers'/>
						<Checkbox text='Legend' k='showLegend'/>
						<label title='Draw magnetic clouds' style={{ paddingLeft: 4, cursor: 'pointer' }}>
							MC<input type='checkbox' checked={settings.showClouds} onChange={e => set('showClouds', e.target.checked)}/></label>
						
					</div>
					<div style={{ margin: '8px 0 20px 4px' }}>
						{settings.transformText.map(({ search, replace, id }) => <div style={{ marginBottom: 4 }} key={id}>
							<label>RegExp
								<input style={{ width: 100, margin: '0 6px' }} type='text' placeholder='search'
									value={search} onChange={e => setTransform(id, { search: e.target.value })}/>
							-&gt;</label>
							<input style={{ width: 100, margin: '0 4px' }} type='text' placeholder='replace'
								value={replace} onChange={e => setTransform(id, { replace: e.target.value })}/>
							<span style={{ position: 'absolute', marginLeft: 2 }} className='CloseButton' onClick={() =>
								set('transformText', settings.transformText.filter(t => t.id !== id))}>&times;</span>
						</div>)}
						<button title='Replace text in labels via RegExp which is applied to labels parts'
							style={{ borderColor: 'transparent', color: color('skyblue'), position: 'absolute', right: 28 }}
							onClick={() => set('transformText', settings.transformText.concat({
								search: '', replace: '', id: Date.now()
							}))}>+ <u>new replace</u></button>
					</div>
					<details style={{ margin: '8px 16px 0 -14px' }}>
						<summary style={{ cursor: 'pointer' }}><b>Override scales</b></summary>
						<div style={{ textAlign: 'right', marginTop: 4 }}>
							{Object.entries(effectiveScales).sort((a,b) => a[0].localeCompare(b[0])).map(([scale, { min, max, bottom, top, active }]) =>
								<div key={scale} style={{ marginTop: 2, color: !active ? color('text-dark') : 'unset', }}>
									<label style={{ cursor: 'pointer' }} title='Click to toggle override'>
										<span style={{ textDecoration: !active ? 'unset' : 'underline' }}>{scale}</span>
										<input type='checkbox' hidden={true} checked={active} onChange={setOverride(scale, 'active')}/>
										<input disabled={!active} title='Scale minimum' style={{ width: 64, marginLeft: 8 }} type='text'
											value={(Math.round(min*100)/100).toString()} onChange={setOverride(scale, 'min')}/>/
										<input disabled={!active} title='Scale maximum' style={{ width: 64, marginLeft: 0 }} type='text'
											value={(Math.round(max*100)/100).toString()} onChange={setOverride(scale, 'max')}/>
										<input disabled={!active} title='Position from bottom (0-1)' style={{ width: 48, marginLeft: 16 }} type='text'
											value={(Math.round(bottom*100)/100).toString().replace('0.', '.')}
											onChange={setOverride(scale, 'bottom')}/>/
										<input disabled={!active} title='Top position from bottom (1-0)' style={{ width: 48, marginLeft: 0 }} type='text'
											value={(Math.round(top*100)/100).toString().replace('0.', '.')}
											onChange={setOverride(scale, 'top')}/>
									</label>
								</div>)}
						</div>
					</details>
					<h4 style={{ margin: '10px 0' }}>Cosmic Rays</h4>
					<Checkbox text='Az' k='showAz'/>
					<Checkbox text='Axy' k='showAxy'/>
					<Checkbox text='vector' k='showAxyVector'/>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Use A0m' k='useA0m'/>
						<Checkbox text='Mask GLE' k='maskGLE'/>
					</div>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Subtract variation trend' k='subtractTrend'/>
					</div>
					<h4 style={{ margin: '10px 0' }}>Solar Wind</h4>
					<Checkbox text='Bx,By' k='showBxBy'/>
					<Checkbox text=' Bz' k='showBz'/>
					<Checkbox text=' beta' k='showBeta'/>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Use temperature index' k='useTemperatureIndex'/>
					</div>
					<h4 style={{ margin: '10px 0' }}>Ring of Stations</h4>
					<Checkbox text='Show index' k='showPrecursorIndex'/>
					<Checkbox text=' Linear size' k='linearSize'/>
					<div style={{ marginTop: 8 }}>
						<label style={{ marginLeft: 4 }}>Variation shift: <input style={{ width: '72px' }} type='number' min='-10' max='10' step='.05'
							value={settings.plotParams.variationShift ?? 0} onChange={e => setParam('variationShift', e.target.valueAsNumber)}/> %</label>
					</div>
					<div style={{ marginTop: 8 }}>
						<label style={{ marginLeft: 4 }}>Circle size shift: <input style={{ width: '72px' }} type='number' min='-100' max='100' step='.5'
							value={settings.plotParams.sizeShift ?? 0} onChange={e => setParam('sizeShift', e.target.valueAsNumber)}/> px</label>
					</div>
				</div>
			</div>
		</div>
		<div ref={container} style={{  display: 'inline-block', cursor: 'pointer',
			...(scaleDown ? { transform: `scale(${Math.min(1, (document.body.clientWidth * devicePixelRatio - 380) / settings.width)})`, transformOrigin: 'top left' } : { overflow: 'auto' })
		}}>
			{plotParams.map(({ id, type, height, params }) => {
				return <div key={id} style={{ height: height / devicePixelRatio + 2, width: settings.width / devicePixelRatio + 2, position: 'relative' }}>
					{type === 'Solar Wind' && <PlotIMF  {...{ params }}/>}
					{type === 'SW Plasma' && <PlotSW    {...{ params }}/>}
					{type === 'Cosmic Rays' && <PlotGSM {...{ params }}/>}
					{type === 'Geomagn' && <PlotGeoMagn {...{ params }}/>}
					{type === 'Ring of Stations' && <PlotCircles {...{ params }}/>}
				</div>;
			})}
		</div>
		<div></div>

	</div>);
}