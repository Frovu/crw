import {  type ChangeEvent, useContext, useEffect, useMemo, useState } from 'react';
import { type PlotsOverrides, color, withOverrides } from '../plots/plotUtil';
import type { TextTransform, ScaleParams, CustomScale } from '../plots/basicPlot';
import { plotPanelOptions, statPanelOptions, useEventsSettings } from './events';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { LayoutContext, gapSize, useLayout, useLayoutsStore } from '../layout';
import { persist } from 'zustand/middleware';
import { apiGet, apiPost, prettyDate, type Size } from '../util';
import { AuthContext, closeContextMenu, getApp, logError, logSuccess, openContextMenu, useAppSettings } from '../app';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useEventsState } from './eventsState';

type uOptions = Omit<uPlot.Options, 'width'|'height'>;
type PlotEntryParams = {
	options: () => uOptions,
	data: (number | null)[][],
	scales: { [key: string]: ScaleParams }
};

type TranformEntry = TextTransform & { id: number, enabled: boolean };
type TransformSet = {
	id: number,
	name: string,
	author: string,
	public: boolean,
	created: string,
	modified: string,
	transforms: TextTransform[]
};
type ActualOverrides = Omit<PlotsOverrides, 'textTransform'> & { textTransform?: TranformEntry[] };
type PlotExportState = {
	inches: number,
	overrides: ActualOverrides,
	perPlotScales: boolean,
	savedScales: { [id: number]: { [key: string]: ScaleParams } },
	plots: { [nodeId: string]: PlotEntryParams },
	set: <T extends keyof ActualOverrides>(k: T, v: ActualOverrides[T]) => void,
	setTransform: (id: number, val: Partial<TranformEntry>) => void,
	swapTransforms: (a: number, b: number) => void,
	setInches: (v: number) => void,
	addScale: (id: number, k: string, scl: ScaleParams) => void,
	removeScale: (id: number, k: string) => void,
	setScale: (id: number, k: string, scl: Partial<ScaleParams>) => void,
	setPerPlotMode: (id: number, v: boolean) => void,
	restoreScales: (id: number) => void,
};

export const usePlotExportSate = create<PlotExportState>()(persist(immer(set => ({
	inches: 12 / 2.54,
	perPlotScales: false,
	savedScales: {},
	overrides: {
		scale: 2,
		fontSize: 14,
		scalesParams: {}
	},
	plots: {},
	set: (k, v) => set(state => { state.overrides[k] = v; }),
	setTransform: (id, val) => set(({ overrides: { textTransform } }) => {
		const found = textTransform?.find(t => t.id === id);
		if (found) Object.assign(found, val); }),
	swapTransforms: (idA, idB) => set(({ overrides }) => {
		const foundA = overrides.textTransform?.find(t => t.id === idA);
		const foundB = overrides.textTransform?.find(t => t.id === idB);
		overrides.textTransform = overrides.textTransform?.map(t =>
			(t.id === idA ? foundB : t.id === idB ? foundA : t) ?? t);
	}),
	setInches: (v) => set(state => { state.inches = v; }),
	addScale: (id, k, scl) => set(({ overrides, perPlotScales, savedScales }) => {
		overrides.scalesParams = { ...overrides.scalesParams, [k]: scl };
		if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {}; }),
	removeScale: (id, k) => set(({ overrides, perPlotScales, savedScales }) => {
		if (overrides.scalesParams?.[k]) delete overrides.scalesParams[k];
		if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {}; }),
	setScale: (id, k, scl) => set(({ overrides, perPlotScales, savedScales }) => {
		if (overrides.scalesParams?.[k]) Object.assign(overrides.scalesParams?.[k], scl);
		if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {}; }),
	setPerPlotMode: (id, val) => set(state => {
		state.perPlotScales = val;
		if (val && state.savedScales[id]) state.overrides.scalesParams = state.savedScales[id]; }),
	restoreScales: (id) => set(state => {
		if (state.perPlotScales)
			state.overrides.scalesParams = state.savedScales[id] ?? {}; }),
})), {
	name: 'plotsExportState',
	partialize: ({ overrides, inches }) => ({ overrides, inches })
}));

function computePlotsLayout() {
	const { active, list } = useLayoutsStore.getState().apps[getApp()];
	const { tree, items } = list[active];

	const root = document.getElementById('layoutRoot')!;

	const layout: { [k: string]: { x: number, y: number, w: number, h: number } } = {};
	const walk = (x: number, y: number, w: number, h: number, node: string='root') => {
		if (!tree[node]) {
			if (plotPanelOptions.includes(items[node]?.type as any)
			 || statPanelOptions.includes(items[node]?.type as any))
				layout[node] = { x, y, w: Math.floor(w), h: Math.floor(h) };
			return;
		}
		const { split, ratio, children } = tree[node]!;
		const splitX = Math.floor(split === 'row' ? w * ratio - gapSize / 2 : 0);
		const splitY = Math.floor(split === 'column' ? h * ratio - gapSize / 2 : 0);
		walk(x, y, splitX || w, splitY || h, children[0]);
		walk(x + splitX, y + splitY, w - splitX , h - splitY , children[1]);
	};
	walk(0, 0, root?.offsetWidth, root?.offsetHeight);

	if (!Object.values(layout).length)
		return { width: 0, height: 0, layout };

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

export function renderOne(nodeId: string) {
	const { plots } = usePlotExportSate.getState();
	const { active, list } = useLayoutsStore.getState().apps[getApp()];
	const { overrides: { scalesParams, textTransform } } = usePlotExportSate.getState();
	const { layout } = computePlotsLayout();
	if (!layout[nodeId] || !plots[nodeId]) return;
	const { options, data } = plots[nodeId];
	const { w, h } = layout[nodeId];
	const scl = w < 600 ? 6 : 4;
	const canvas = document.createElement('canvas');
	canvas.width = w * scl * devicePixelRatio;
	canvas.height = h * scl * devicePixelRatio;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = color('bg');
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const controlsPresent = !!Object.values(list[active]?.items).find(i => i?.type === 'ExportControls');
	const opts = {
		...withOverrides(options, { scale: scl,
			...(controlsPresent && { scalesParams, textTransform: textTransform?.filter(tr => tr.enabled) })
		}),
		width: Math.round(w * scl),
		height: Math.round(h * scl), };
	new uPlot(opts, data as any, (u, init) => {
		init();
		queueMicrotask(() => {
			ctx.drawImage(u.ctx.canvas, 0, 0);
			u.destroy();
			canvas.toBlob(blob => blob && window.open(URL.createObjectURL(blob)));
		});
	 });
}

async function doRenderPlots() {
	const { width, height, layout } = computePlotsLayout();
	const { plots, inches, overrides } = usePlotExportSate.getState();
	const { scale, fontSize, textTransform } = overrides;
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
			...withOverrides(options, {
				...overrides,
				textTransform: textTransform?.filter(tr => tr.enabled),
				fontSize: width / inches / 72 * fontSize
			}),
			width: Math.round(w),
			height: Math.round(h),
		};
		const upl: uPlot = await new Promise(resolve => new uPlot(opts, data as any, (u, init) => {
			init();
			resolve(u);
		}));
		ctx.drawImage(upl.ctx.canvas, Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio));
		upl.destroy();
	}
	return canvas;
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

	return <div style={{ padding: 2, height: '100%', overflow: 'auto' }} onClick={() => setShow(!show)}>
		<span style={{ padding: 2 }}>preview plots (may be slow) <input type='checkbox' checked={show} readOnly/></span>
		{show && renderTime && <div style={{ position: 'absolute', fontSize: 14, color: color('text-dark'), bottom: 4, right: 4 }}>Rendered in {renderTime.toFixed()} ms</div>}
		<div ref={setContainer} style={{ display: !show ? 'none' : 'block',
			transform: `scale(${(context.size.width - 4) / width / scale})`, transformOrigin: 'top left' }}/>
	</div>;
}

export function ExportableUplot({ size, options, data, onCreate }:
{ size?: (sz: Size, unknown: boolean) => Size, options: () => uOptions, data: (number | null)[][], onCreate?: (u: uPlot) => void }) {
	const layout = useContext(LayoutContext);
	const { theme, colors } = useAppSettings();
	const { scalesParams, textTransform } = usePlotExportSate(st => st.overrides);
 	const { items } = useLayout();
	const controlsPresent = !!Object.values(items).find(i => i?.type === 'ExportControls');

	const [upl, setUpl] = useState<uPlot | null>(null);
	const borderSize = layout?.size ? { width: layout?.size.width - 2, height: layout?.size.height - 2 } : { width: 600, height: 400 };
	const sz = size ? size(borderSize, !layout?.size) : borderSize;

	useEffect(() => {
		upl && upl.setSize(sz);
	}, [upl, sz.height, sz.width]); // eslint-disable-line

	const plot = useMemo(() => {
		const opts = !controlsPresent ? options() : withOverrides(options, { scalesParams, 
			textTransform: textTransform?.filter(tr => tr.enabled) });
		console.log('exp mememem', data)
		return <UplotReact {...{
			options: { ...sz, ...opts }, data: data as any, onCreate: u => {
				if (layout?.id) queueMicrotask(() => usePlotExportSate.setState(state => {
					state.plots[layout.id] = { options, data, scales: {} };
					for (const scl in u.scales) {
						const { positionValue, scaleValue }: CustomScale = u.scales[scl];
						if (positionValue && scaleValue)
							state.plots[layout.id].scales[scl] = { ...positionValue, ...scaleValue };
					}
				}));
				setUpl(u);
				onCreate?.(u);
			} }}/>;
	}, [theme, devicePixelRatio, colors, controlsPresent, options, scalesParams, textTransform, data, layout?.id, onCreate]); // eslint-disable-line
	return plot;
}

export type TextTransformMenuDetail = {
	action: 'save' | 'load'
};
export function TextTransformContextMenu({ detail: { action } }: { detail: TextTransformMenuDetail }) {
	const { overrides: { textTransform: current }, set } = usePlotExportSate();
	const { login } = useContext(AuthContext);
	const [selected, setSelected] = useState<number | null>(null);
	const [nameInput, setNameInput] = useState('');
	const [publicInput, setPublicInput] = useState(false);
	const [doReplace, setDoReplace] = useState(true);
	const queryClient = useQueryClient();

	const query = useQuery(['textTransforms'], () => apiGet<{ list: TransformSet[] }>('events/text_transforms'), {
		onError: logError
	});

	const presets = useMemo(() => {
		if (!query.data)
			return null;
		return query.data.list.sort((a, b) => (a.author === login ? -1 : 1) - (b.author === login ? -1 : 1));
	}, [query.data, login]);

	const sel = presets?.find(p => p.id === selected);

	const upsertMut = useMutation(() => apiPost('events/text_transforms/upsert', {
		name: sel?.name ?? nameInput,
		public: sel?.public ?? publicInput,
		transforms: current?.filter(f => f.enabled).map(({ search, replace }) => ({ search, replace }))
	}), {
		onSuccess: () => {
			logSuccess('Text preset saved: ' + (sel?.name ?? nameInput));
			setTimeout(closeContextMenu, 1000);
			queryClient.invalidateQueries('textTransforms');
		},
		onError: logError
	});

	const removeMut = useMutation((name: string) => apiPost('events/text_transforms/remove', { name }), {
		onSuccess: (msg, name) => {
			logSuccess('Text preset deleted: ' + name);
			queryClient.invalidateQueries('textTransforms');
		},
		onError: logError
	});

	if (query.error)
		return <div style={{ color: color('red') }}>error</div>;
	if (!presets)
		return <div style={{ color: color('text-dark') }}>loading...</div>;

	const upsert = (e: any) => {
		e.stopPropagation();
		upsertMut.mutate();
	};

	const load = (transforms: TextTransform[]) => (e: any) => {
		const entries = transforms.map(({ search, replace }, i) =>
			({ search, replace, id: Date.now() + i, enabled: true }));
		const merged = doReplace ? entries : current?.concat(
			entries.filter(nt => !current.find(t => t.search === nt.search)));
		
		set('textTransform', merged);
		closeContextMenu();
	};

	if (action === 'load')
		return <>
			<div style={{ color: color('text-dark'), textAlign: 'left', marginTop: -2 }}>
				load text transforms set:</div>
			<label title='Current transforms will be lost if checked' style={{ paddingLeft: 2 }}>overwrite current
				<input type='checkbox' checked={doReplace} onChange={e => setDoReplace(e.target.checked)}/></label>
			<div className='separator'/>
			{presets.length < 1 && <div>no saved presets</div>}
			{presets.length > 0 && <div style={{ userSelect: 'none' }}>
				{presets.map(({ id, name, public: isPub, author, transforms, created, modified }) =>
					<div key={id} className='SelectOption' style={{ display: 'flex', maxWidth: 320, alignItems: 'center', gap: 6, padding: '0 4px' }}
						title={`Author: ${author}\nCreated: ${prettyDate(new Date(created))}\nModified: ${prettyDate(new Date(modified))}`}>
						<div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', cursor: 'pointer', flex: 1 }}
							onClick={load(transforms)}>
							{name}</div>
						{isPub && <div style={{ color: color('text-dark'), fontSize: 12 }}>(public)</div>}
						{author === login ? <div className='CloseButton' title='Delete preset'
							onClick={() => removeMut.mutate(name)}/> : <div style={{ width: 16 }}/>}
					</div>)}	
			</div>}
		</>;
	const nameInvalid = selected == null &&
		(nameInput === '' || presets.find(p => p.author === login && p.name === nameInput));
	
	return <div className='Group'>
		<div style={{ color: color('text-dark'), textAlign: 'left', marginTop: -2, fontSize: 14 }}>
			Only enabled replaces are saved!</div>
		<div>Save as:<select className='Borderless' style={{ width: 194, marginLeft: 4 }}
			value={selected ?? '__new'} onChange={e => setSelected(e.target.value === '__new' ? null : parseInt(e.target.value))}>
			<option value='__new'>-- new preset --</option>
			{presets.filter(s => s.author === login).map(({ id, name }) =>
				<option key={id} value={id}>{name}</option>)}
		</select></div>
		{selected == null && <div>
			Name:<input autoFocus type='text' style={{ width: 222, marginLeft: 4, borderColor: color(nameInvalid ? 'active' : 'bg')  }}
				value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.code === 'Enter' && upsert(e)}/>	
		</div>}
		{selected == null && <div><label style={{ color: color(publicInput ? 'magenta' : 'text') }}>public preset
			<input type='checkbox' checked={publicInput} onChange={e => setPublicInput(e.target.checked)}/></label></div>}
		<div className='separator'/>
		<div className='Row'>
			<div style={{ color: color(upsertMut.isError ? 'red' : 'green') }}>{upsertMut.isSuccess ? 'OK' : upsertMut.isError ? 'ERROR' : ''}</div>
			<div style={{ flex: 1 }}/>
			<button className='TextButton' disabled={!!nameInvalid} style={{ textAlign: 'right' }} onClick={upsert}>Save preset</button>
		</div>
	</div>;
}

export function ExportControls() {
	const { overrides: { scale, fontSize, fontFamily, textTransform, scalesParams },
		plots, inches, perPlotScales, setInches, set, setTransform, swapTransforms,
		addScale, setScale, removeScale, setPerPlotMode, restoreScales } = usePlotExportSate();
	const plotId = useEventsState(state => state.plotId);
	const { width, height } = computePlotsLayout();
	const [useCm, setUseCm] = useState(true);
	const [dragging, setDragging] = useState<number | null>(null);

	useEffect(() => {
		if (plotId != null)
			restoreScales(plotId);
	}, [restoreScales, plotId]);

	if (plotId == null) return <div>plotId is null</div>;

	async function doExportPlots(download: boolean=false) {
		const canvas = await doRenderPlots();
		if (!download)
			return canvas.toBlob(blob => blob && window.open(URL.createObjectURL(blob)));
		const a = document.createElement('a');
		const w = Math.round(inches * (useCm ? 2.54 : 1) / .25) * .25;
		a.download = `feid_figure_${w.toString().replace('.', 'p')}_${useCm ? 'cm' : 'in'}.png`;
		a.href = canvas.toDataURL()!;
		return a.click();
	}
	const plotsScales = Object.keys(plots).filter(id =>
		Object.keys(plots[id].scales).length > 0).map(id => plots[id].scales);
	const scales: { [k: string]: ScaleParams } = Object.assign({}, ...plotsScales);
	const effectiveScales = Object.entries(scales).map(([scl, params]) => ({ scl, ...(scalesParams?.[scl] ?? params) }));
	
	const fontPx = Math.round(width / inches / 72 * fontSize * scale);
	const setOverride = (scl: string, param: 'min'|'max'|'bottom'|'top') => (e: ChangeEvent<HTMLInputElement>) => {
		const val = parseFloat(e.target.value);
		if (!isNaN(val)) setScale(plotId, scl, { [param]: val });
	};

	return <div style={{ padding: 4, display: 'flex', flexDirection: 'column', fontSize: 14, maxHeight: '100%' }}>
		<div>
			<div style={{ display: 'flex', gap: 4, color: color('white') }}>
				<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots()}>Open png</button>
				<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots(true)}>Download</button>
			</div>
			{devicePixelRatio !== 1 && <div style={{ fontSize: 12, color: color('red') }}>pixelRatio ({devicePixelRatio.toFixed(2)}) != 1,
			export won't work as expected, press Ctrl+0 if it helps</div>}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 4 }}>
				<span><label title={`Actual font size = ${fontPx}px = ${(fontPx / scale / width * inches * 72).toFixed(2)}pt`}>Font<input style={{ width: 42, margin: '0 4px' }} type='number' min='6' max='24'
					value={fontSize} onChange={e => set('fontSize', e.target.valueAsNumber)}/>pt</label>
				<input type='text' style={{ marginLeft: 8, width: 148 }} placeholder='Roboto Mono'
					value={fontFamily??''} onChange={e => set('fontFamily', e.target.value || undefined)}/></span>
				<span><label>Size<input style={{ width: 56, marginLeft: 4 }} type='number' min='0' max='100' step={useCm ? .5 : .25}
					value={Math.round(inches * (useCm ? 2.54 : 1) / .25) * .25} onChange={e => setInches(e.target.valueAsNumber / (useCm ? 2.54 : 1))}/></label>
				<label style={{ padding: '0 4px' }}>{useCm ? 'cm' : 'in'}
					<input hidden type='checkbox' checked={useCm} onChange={(e) => setUseCm(e.target.checked)}/></label>,
				<label style={{ paddingLeft: 4 }} title='Approximate resolution when shrinked to specified size'>
					<select style={{ marginLeft: 2, marginRight: 2, width: 86 }} value={scale} onChange={e => set('scale', parseInt(e.target.value))}>
						{[2,3,4,6,8,10,16].map(scl => <option key={scl} value={scl}>{(width * scl / inches).toFixed()} ppi</option>)}
					</select><span style={{ color: color('text-dark') }}>({scale}x)</span></label></span>
			</div>
			<div style={{ color: color('text-dark'), paddingTop: 2 }}>image: {width*scale} x {height*scale} px, ≈ {(width * height * .74 * (scale - 1.2) / 1024 / 1024).toFixed(2)} MB</div>
			<div className='separator'></div>
			<PlotIntervalInput step={1}/>
			<div className='separator'></div>
		</div>
		<div style={{ overflowY: 'scroll', paddingBottom: 8 }}>
			<span style={{ color: color('text-dark') }}>Override scales: 
				<label title='Adjust scales for each event individually'
					style={{ display: 'inline-block', textDecoration: perPlotScales ? 'underline' : 'unset',
						marginLeft: 8, color: perPlotScales ? color('magenta') : 'inherit' }}>per event
					<input type='checkbox' checked={perPlotScales} onChange={e => setPerPlotMode(plotId, e.target.checked)}/></label></span>
			<div style={{ maxWidth: 'max-content', textAlign: 'right' }}>
				{effectiveScales.sort((a,b) => a.scl.localeCompare(b.scl)).map(({ scl, min, max, bottom, top }) => {
					const active = !!scalesParams?.[scl];
					return <div key={scl} style={{ cursor: 'pointer', color: !active ? color('text-dark') : 'unset', }}
						onClick={e => !(e.target instanceof HTMLInputElement) && (active ? removeScale(plotId, scl) : addScale(plotId, scl, scales[scl]))}>
						<span style={{ textDecoration: !active ? 'unset' : 'underline' }}>{scl}</span>
						<input disabled={!active} title='Scale minimum' style={{ width: 54, marginTop: 2, marginLeft: 8 }} type='text'
							value={(Math.round(min*100)/100).toString()} onChange={setOverride(scl, 'min')}/>/
						<input disabled={!active} title='Scale maximum' style={{ width: 54, marginRight: 4 }} type='text'
							value={(Math.round(max*100)/100).toString()} onChange={setOverride(scl, 'max')}/>
						<div style={{ display: 'inline-block' }}>at
							<input disabled={!active} title='Position from bottom (0-1)' style={{ width: 32, marginTop: 2, marginLeft: 4 }} type='text'
								value={(Math.round(bottom*100)/100).toString().replace('0.', '.')}
								onChange={setOverride(scl, 'bottom')}/>/
							<input disabled={!active} title='Top position from bottom (1-0)' style={{ width: 32 }} type='text'
								value={(Math.round(top*100)/100).toString().replace('0.', '.')}
								onChange={setOverride(scl, 'top')}/></div>
					</div>;})}</div>
			<div className='separator'/>
			<div style={{ display: 'flex', flexFlow: 'column wrap', gap: 4, minWidth: 160, paddingTop: 4, paddingRight: 8 }}
				onMouseUp={() => setDragging(null)} onMouseLeave={() => setDragging(null)}>
				<div style={{ textAlign: 'right', marginTop: -8, padding: '0 8px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
					<button title='Load saved or public transforms (replace current)' className='TextButton' style={{ padding: '0 6px', color: color('skyblue') }}
						onClick={openContextMenu('textTransform', { action: 'load' })}><u>load</u></button>
					<button title='Save text transorms for future reuse or sharing' className='TextButton'
						disabled={!textTransform?.length} style={{ padding: '0 6px', color: color(!textTransform?.length ? 'text-dark' : 'skyblue') }}
						onClick={openContextMenu('textTransform', { action: 'save' })}><u>save</u></button>
					<div title='Some characters, if thou mightst need em' style={{ userSelect: 'text', letterSpacing: 2,
						fontSize: 16, paddingRight: 8, color: color('text-dark') }}>−+±×⋅·∙⋆°</div>
					<button title='Replace text in labels via Regular Expressions which are applied to labels parts'
						className='TextButton' style={{ color: color('skyblue') }}
						onClick={() => set('textTransform', [{
							search: '', replace: '', enabled: true, id: Date.now()
						}].concat(textTransform ?? []))}>+ <u>new replace</u></button>
				</div>
				{textTransform?.map(({ search, replace, id, enabled }) => <div key={id}
					style={{ color: !enabled ? color('text-dark') : 'unset', display: 'flex', gap: 4, flexFlow: 'row wrap', alignItems: 'center' }}
					title='Drag to change replacement order' onMouseOver={e => {
						if (dragging && dragging !== id) swapTransforms(dragging, id); }}
					onMouseDown={e => !(e instanceof HTMLInputElement) && setDragging(id)}>
					<label style={{ minWidth: 'max-content' }}><input type='checkbox' checked={!!enabled}
						onChange={e => setTransform(id, { enabled: e.target.checked })}/>RegEx</label>
					<input disabled={!enabled} type='text' style={{ flex: 2, minWidth: '4em', maxWidth: '10em' }} placeholder='search'
						title='Dont forget to escape special characters with a \, like \(. Start with whitespace to target legend only.'
						value={search} onChange={e => setTransform(id, { search: e.target.value })}/>
					<div style={{ flex: '2 10em', gap: 4, alignItems: 'center',
						minWidth: 'min(10em, 50%)', maxWidth: '20em', display: 'flex' }}><span style={{ cursor: 'grab' }}>-&gt;</span>
						<input disabled={!enabled} type='text' style={{ flex: 1, minWidth: 0 }} placeholder='replace'
							title='Following tags are supported: <i> <b> <sup> <sub>'
							value={replace} onChange={e => setTransform(id, { replace: e.target.value })}/>
						<span style={{ marginLeft: -2, marginTop: -2 }} className='CloseButton' onClick={() =>
							set('textTransform', textTransform.filter(t => t.id !== id))}></span></div>
				</div>)}
			</div>
		</div>
	</div>;
}

export function PlotIntervalInput({ step: alterStep }: { step?: number }) {
	const { plotOffset, set } = useEventsSettings();
	const [left, right] = plotOffset;
	const step = alterStep ?? 24;

	return <div style={{ display: 'inline-flex', gap: 4, cursor: 'default' }} title='Plot time interval, as hours offset from event onset'>
		Interval: <input style={{ width: 54, height: '1.25em' }} type='number' min='-240' max='0' step={step} defaultValue={left}
			onChange={e => !isNaN(e.target.valueAsNumber) && set('plotOffset', [e.target.valueAsNumber, right])}/>
		/ <input style={{ width: 54, height: '1.25em' }} type='number' min={step} max='240' step={step} defaultValue={right}
			onChange={e => !isNaN(e.target.valueAsNumber) && set('plotOffset', [left, e.target.valueAsNumber])}/> h
	</div>;
}