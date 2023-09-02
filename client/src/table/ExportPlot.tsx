import { useContext, useMemo, useRef } from 'react';
import { useEventListener, usePersistedState } from '../util';
import PlotSW, { SWParams } from '../plots/SW';
import PlotIMF, { IMFParams } from '../plots/IMF';
import PlotGSM, { GSMParams } from '../plots/GSM';
import PlotGSMAnisotropy from '../plots/GSMAnisotropy';
import PlotGeoMagn from '../plots/Geomagn';
import { CirclesParams, PlotCircles } from '../plots/Circles';
import { PlotContext, SettingsContext, plotParamsFromSettings, themeOptions } from './Table';
import { Position, color } from '../plots/plotUtil';

// const trivialPlots = ['Solar Wind', 'SW Plasma', 'Cosmic Rays', 'CR Anisotropy', 'Geomagn', 'Ring of Stations'] as const;
const trivialPlots = {
	'Solar Wind': PlotIMF,
	'SW Plasma': PlotSW,
	'Cosmic Rays': PlotGSM,
	'CR Anisotropy': PlotGSMAnisotropy,
	'Geomagn': PlotGeoMagn,
	'Ring of Stations': PlotCircles
};
const plotsList = Object.keys(trivialPlots) as (keyof typeof trivialPlots)[];

type PlotSettings = {
	type: keyof typeof trivialPlots,
	height: number,
	showTime: boolean,
	showMeta: boolean
	id: number
};

type PlotExportSettings = Omit<{
	theme: typeof themeOptions[number],
	width: number,
	plots: PlotSettings[]
} & GSMParams & SWParams & IMFParams & CirclesParams, 'interval'|'showTimeAxis'|'showMetaInfo'>;

const defaultSettings = (): PlotExportSettings => ({
	showGrid: true,
	showMarkers: true,
	showLegend: true,
	showAz: false,
	showBxBy: false,
	showBz: true,
	useA0m: true,
	subtractTrend: true,
	maskGLE: true,
	theme: 'Dark',
	width: 640,
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

export default function PlotExportView({ escape }: { escape: () => void }) {
	const { settings: tableSettings } = useContext(SettingsContext);
	const plotContext = useContext(PlotContext);
	const [settings, setSettings] = usePersistedState('aidPlotExport', defaultSettings);
	const dragRef = useRef<Position | null>(null);
	const divRef = useRef<HTMLDivElement>(null);

	document.documentElement.setAttribute('main-theme', settings.theme);

	const set = <T extends keyof PlotExportSettings>(what: T, val: PlotExportSettings[T]) => setSettings(st => ({ ...st, [what]: val }));
	const setPlot = <T extends keyof PlotSettings>(id: number, k: T, v: PlotSettings[T]) => setSettings(st => {
		const i = st.plots.findIndex(p => p.id === id);
		st.plots[i] = { ...st.plots[i], [k]: v };
		return { ...st, plots: st.plots };
	});
	const container = useRef<HTMLDivElement>(null);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (['Escape', 'KeyE'].includes(e.code))
			escape();
		if ('KeyT' === e.code)
			setSettings(st => ({ ...st, theme: themeOptions[(themeOptions.indexOf(st.theme) + 1) % themeOptions.length] }));
	});

	const params = useMemo(() => ({
		...plotParamsFromSettings(tableSettings),
		...plotContext!,
		...settings,
		plots: undefined
	}), [tableSettings, plotContext, settings]);

	const doExport = (download?: boolean) => {
		const canvas = document.createElement('canvas');
		canvas.width = settings.width;
		canvas.height = settings.plots.reduce((s, a) => s + a.height, 0);
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = color('bg');
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		let y = 0;
		settings.plots.forEach((plot, i) => {
			const plotCanvas = container.current!.children[i].querySelector('canvas');
			if (!plotCanvas) return;
			ctx.drawImage(plotCanvas, 0, y);
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
	/*
<div>
	± Days:
	<MenuInput type='number' min='-7' max='0' step='.5' value={settings.plotTimeOffset?.[0]}
		onChange={(v: any) => set('plotTimeOffset', (prev) => [v, prev[1]])}/>
	/
	<MenuInput type='number' min='1' max='14' step='.5' value={settings.plotTimeOffset?.[1]}
		onChange={(v: any) => set('plotTimeOffset', (prev) => [prev[0], v])}/>
</div>
<h4>Cosmic Rays</h4>
<MenuCheckbox text='Show Az' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/>
<MenuCheckbox text='Subtract variation trend' value={!!settings.plotSubtractTrend} callback={v => set('plotSubtractTrend', () => v)}/>
<MenuCheckbox text='Mask GLE' value={!!settings.plotMaskGLE} callback={v => set('plotMaskGLE', () => v)}/>
<MenuCheckbox text='Use dst corrected A0m' value={!!settings.plotUseA0m} callback={v => set('plotUseA0m', () => v)}/>
<MenuCheckbox text={'Use index: ' + (settings.plotIndexAp ? 'Ap' : 'Kp')} hide={true} value={!!settings.plotIndexAp} callback={v => set('plotIndexAp', () => v)}/>
<h4>Solar Wind</h4>
<MenuCheckbox text={'Temperature: ' + (settings.plotTempIdx ? 'index' : 'plain')} hide={true} value={!!settings.plotTempIdx} callback={v => set('plotTempIdx', () => v)}/>
<MenuCheckbox text='Show IMF Bz' value={!!settings.plotImfBz} callback={v => set('plotImfBz', () => v)}/>
<MenuCheckbox text='Show IMF Bx,By' value={!!settings.plotImfBxBy} callback={v => set('plotImfBxBy', () => v)}/>
	*/
	function Checkbox({ text, k }: { text: string, k: keyof PlotExportSettings }) {
		return <label style={{ margin: '0 4px', cursor: 'pointer' }}>{text}<input style={{ marginLeft: 8 }} type='checkbox' checked={settings[k] as boolean} onChange={e => set(k, e.target.checked)}/></label>;
	}

	const clamp = (min: number, max: number, val: number) => Math.max(min, Math.min(max, val));
	return (<div style={{ userSelect: 'none', padding: 8 / devicePixelRatio, display: 'grid', gridTemplateColumns: `${336 / devicePixelRatio + 20}px auto`, height: 'calc(100vh - 16px)' }}>
		<div>
			<div style={{ position: 'fixed', left: 0, top: 0, transform: `scale(${1 / devicePixelRatio})`, transformOrigin: 'top left' }}>
				<div style={{ padding: '16px 0 0 16px' }}>
					<div style={{ marginBottom: 12 }}>
						<button style={{ padding: '2px 12px' }}
							onClick={() => doExport()}><u>O</u>pen image</button>
						<button style={{ padding: '2px 12px', marginLeft: 14 }}
							onClick={() => doExport(true)}><u>D</u>ownload image</button>
					</div>
					<div>
						<label>Width: <input style={{ width: 64 }} type='number' min='200' max='3600' step='20'
							onWheel={(e: any) => set('width', clamp(320, 3600, (e.target.valueAsNumber || 0) + (e.deltaY < 0 ? 20 : -20)))}
							value={settings.width} onChange={e => set('width', clamp(320, 3600, e.target.valueAsNumber))}/> px</label>
						<button style={{ marginLeft: 20, width: 100 }} onClick={() => setSettings(defaultSettings())}>Reset all</button>
					</div>
					<div style={{ marginTop: 12 }}>
						<label>Theme: <select value={settings.theme} onChange={e => set('theme', e.target.value as any)}>
							{themeOptions.map(th => <option key={th} value={th}>{th}</option>)}
						</select> </label>
					</div>
				</div>
				<div ref={divRef} style={{ padding: '8px 0 8px 20px', width: 356, cursor: 'grab' }}
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
						<select style={{ width: 114 }} value={type} onChange={e => setPlot(id, 'type', e.target.value as any)}
							onWheel={e => setPlot(id, 'type',
								plotsList[(plotsList.indexOf(type) + (e.deltaY < 0 ? 1 : -1) + plotsList.length) % plotsList.length] as any)}>
							{plotsList.map(ptype =>
								<option key={ptype} value={ptype}>{ptype}</option>)}
						</select>
						<label title='Plot height'> h=<input style={{ width: 54 }} type='number' min='80' max='1800' step='20'
							onWheel={(e: any) => setPlot(id, 'height', clamp(80, 1800, (e.target.valueAsNumber || 0) + (e.deltaY < 0 ? 20 : -20)))}
							value={height} onChange={e => setPlot(id, 'height', clamp(80, 1800, e.target.valueAsNumber))}></input></label>
						<label style={{ cursor: 'pointer', marginLeft: 8 }}>tm
							<input type='checkbox' checked={showTime} onChange={e => setPlot(id, 'showTime', e.target.checked)}/></label>
						<label style={{ cursor: 'pointer', marginLeft: 8 }}>e
							<input type='checkbox' checked={showMeta} onChange={e => setPlot(id, 'showMeta', e.target.checked)}/></label>
						<span style={{ position: 'absolute', marginLeft: 4, top: 1 }} className='CloseButton' onClick={() =>
							set('plots', settings.plots.filter(p => p.id !== id))}>&times;</span>
						<span style={{ position: 'absolute', fontSize: 22, marginLeft: 18, top: -4 }}><b>⋮</b></span>
						<span style={{ position: 'absolute', fontSize: 22, left: -20, top: -4 }}><b>⋮</b></span>
					</div> )}
					<button style={{ marginTop: 4, borderColor: 'transparent', color: color('skyblue'), cursor: 'pointer' }}
						onClick={() => set('plots', settings.plots.concat({
							height: 200,
							type: plotsList.find(t => !settings.plots.find(p => p.type === t)) ?? plotsList[0],
							showTime: true,
							showMeta: true,
							id: Date.now()
						}))}>+ <u>add new plot</u></button>
				</div>
				<div style={{ padding: '12px 0 0 24px' }}>
					<h4 style={{ margin: '0 0 16px 0' }}>Interval</h4>
					<h4 style={{ margin: '12px 0' }}>Global</h4>
					<div>
						<Checkbox text='Grid' k='showGrid'/>
						<Checkbox text=' Markers' k='showMarkers'/>
						<Checkbox text=' Legend' k='showLegend'/>
					</div>
					<h4 style={{ margin: '12px 0' }}>Cosmic Rays</h4>
					<Checkbox text='Show Az' k='showAz'/>
					<div style={{ marginTop: 8 }}>
						<Checkbox text=' Use A0m' k='useA0m'/>
						<Checkbox text=' Mask GLE' k='maskGLE'/>
					</div>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Subtract variation trend' k='subtractTrend'/>
					</div>
					<h4 style={{ margin: '12px 0' }}>Solar Wind</h4>
					<Checkbox text='Bx,By' k='showBxBy'/>
					<Checkbox text=' Bz' k='showBz'/>
					<Checkbox text=' beta' k='showBeta'/>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Use temperature index' k='useTemperatureIndex'/>
					</div>
					<h4 style={{ margin: '12px 0' }}>Ring of Stations</h4>
					<Checkbox text='Show precursor index' k='showPrecursorIndex'/>
					<div style={{ marginTop: 8 }}>
						<label style={{ marginLeft: 4 }}>Variation shift: <input style={{ width: '72px' }} type='number' min='-10' max='10' step='.05'
							value={settings.variationShift ?? 0} onChange={e => set('variationShift', e.target.valueAsNumber)}/> %</label>
					</div>
					<div style={{ marginTop: 8 }}>
						<label style={{ marginLeft: 4 }}>Circle size shift: <input style={{ width: '72px' }} type='number' min='-100' max='100' step='.5'
							value={settings.sizeShift ?? 0} onChange={e => set('sizeShift', e.target.valueAsNumber)}/> px</label>
					</div>
					<div style={{ marginTop: 8 }}>
						<Checkbox text='Linear size' k='linearSize'/>
					</div>
				</div>
			</div>
		</div>
		<div ref={container} style={{ display: 'inline-block', cursor: 'pointer', overflow: 'auto' }}>
			{settings.plots.map(({ id, type, height, showTime, showMeta }) => {
				const Plot = trivialPlots[type];
				return <div key={id} style={{ height: height / devicePixelRatio + 2, width: settings.width / devicePixelRatio + 2, position: 'relative' }}>
					<Plot {...params} showTimeAxis={showTime} showMetaInfo={showMeta}/>
				</div>; })}
		</div>
		<div></div>

	</div>);
}