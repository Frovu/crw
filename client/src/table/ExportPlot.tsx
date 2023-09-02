import { useContext, useMemo, useRef } from 'react';
import { useEventListener, usePersistedState } from '../util';
import PlotSW from '../plots/SW';
import PlotIMF from '../plots/IMF';
import PlotGSM from '../plots/GSM';
import PlotGSMAnisotropy from '../plots/GSMAnisotropy';
import PlotGeoMagn from '../plots/Geomagn';
import { PlotCircles } from '../plots/Circles';
import { PlotContext, SettingsContext, plotParamsFromSettings, themeOptions } from './Table';
import { color } from '../plots/plotUtil';

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

type PlotExportSettings = {
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean,
	theme: typeof themeOptions[number],
	width: number,
	plots: PlotSettings[]
};
const defaultSettings = (): PlotExportSettings => ({
	showGrid: true,
	showMarkers: true,
	showLegend: true,
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
<MenuCheckbox text='Show markers' value={!!settings.plotMarkers} callback={v => set('plotMarkers', () => v)}/>
<MenuCheckbox text='Show grid' value={!!settings.plotGrid} callback={v => set('plotGrid', () => v)}/>
<MenuCheckbox text='Show legend' value={!!settings.plotLegend} callback={v => set('plotLegend', () => v)}/>
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
		return <label style={{ margin: '0 4px' }}>{text}<input style={{ marginLeft: 8 }} type='checkbox' checked={settings[k] as boolean} onChange={e => set(k, e.target.checked)}/></label>;
	}

	const clamp = (min: number, max: number, val: number) => Math.max(min, Math.min(max, val));
	return (<div style={{ userSelect: 'none', padding: 8, display: 'grid', gridTemplateColumns: `${340 / devicePixelRatio + 20}px auto`, gap: 8, height: 'calc(100vh - 16px)' }}>
		<div>
			<div style={{ margin: '8px 0 0 8px', position: 'absolute', transform: `scale(${1 / devicePixelRatio})`, transformOrigin: 'top left' }}>
				<div style={{ margin: '0 0 16px 0' }}>
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
				<div style={{ padding: '8px 0 8px 8px' }}>
					{settings.plots.map(({ type, height, id, showTime, showMeta }) => <div style={{ marginTop: 8, position: 'relative' }} key={id}>
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
				<div>
					<Checkbox text='Grid' k='showGrid'/>
					<Checkbox text='Markers' k='showMarkers'/>
					<Checkbox text='Legend' k='showLegend'/>
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