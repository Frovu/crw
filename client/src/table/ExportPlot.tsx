import { useContext, useMemo, useRef, useState } from 'react';
import { useEventListener, usePersistedState } from '../util';
import PlotSW from '../plots/SW';
import PlotIMF from '../plots/IMF';
import PlotGSM from '../plots/GSM';
import PlotGSMAnisotropy from '../plots/GSMAnisotropy';
import PlotGeoMagn from '../plots/Geomagn';
import { PlotCircles } from '../plots/Circles';
import { PlotContext, SettingsContext, plotParamsFromSettings } from './Table';
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
	id: number
};
type PlotExportSettings = {
	width: number,
	plots: PlotSettings[]
};
const defaultSettings = (): PlotExportSettings => ({
	width: 640,
	plots: [{
		type: 'Solar Wind',
		height: 200,
		showTime: true,
		id: 0,
	}, {
		type: 'Cosmic Rays',
		height: 200,
		showTime: true,
		id: 1,
	}, {
		type: 'Geomagn',
		height: 100,
		showTime: false,
		id: 2,
	}, {
		type: 'Ring of Stations',
		height: 300,
		showTime: true,
		id: 3,
	}]
});

export default function PlotExportView({ escape }: { escape: () => void }) {
	const { settings: tableSettings } = useContext(SettingsContext);
	const plotContext = useContext(PlotContext);
	const [settings, setSettings] = usePersistedState('aidPlotExport', defaultSettings);

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
	});

	const params = useMemo(() => ({
		...plotParamsFromSettings(tableSettings),
		...plotContext!
	}), [tableSettings, plotContext]);

	const doExport = (download?: boolean) => {
		const canvas = document.createElement('canvas');
		canvas.width = settings.width * devicePixelRatio;
		canvas.height = settings.plots.reduce((s, a) => s + a.height, 0) * devicePixelRatio;
		const ctx = canvas.getContext('2d')!;
		let y = 0;
		settings.plots.forEach((plot, i) => {
			const plotCanvas = container.current!.children[i].querySelector('canvas');
			if (!plotCanvas) return;
			ctx.drawImage(plotCanvas, 0, y);
			y += plot.height * devicePixelRatio;
		});

		const a = document.createElement('a');
		if (download)
			a.download = 'aid_compound_plot.png';
		else
			a.target = '_blank';
		a.href = canvas.toDataURL()!;
		a.click();
	};

	const clamp = (min: number, max: number, val: number) => Math.max(min, Math.min(max, val));
	return (<div style={{ display: 'flex', userSelect: 'none', width: settings.width + 320 + 8, padding: 16 }}>
		<div style={{ width: 320 }} ref={el => el?.addEventListener('wheel', e => e.preventDefault(), { passive: false })}>
			<div>
				<label>Width: <input style={{ width: 64 }} type='number' min='200' max='3600' step='20'
					onWheel={(e: any) => set('width', clamp(320, 3600, (e.target.valueAsNumber || 0) + (e.deltaY < 0 ? 20 : -20)))}
					value={settings.width} onChange={e => set('width', clamp(320, 3600, e.target.valueAsNumber))}/> px</label>
				
			</div>
			<div style={{ padding: 8 }}>
				{settings.plots.map(({ type, height, id, showTime }) => <div style={{ marginTop: 8, position: 'relative' }} key={id}>
					<select style={{ width: 128 }} value={type} onChange={e => setPlot(id, 'type', e.target.value as any)}
						onWheel={e => setPlot(id, 'type',
							plotsList[(plotsList.indexOf(type) + (e.deltaY < 0 ? 1 : -1) + plotsList.length) % plotsList.length] as any)}>
						{plotsList.map(ptype =>
							<option key={ptype} value={ptype}>{ptype}</option>)}
					</select>
					<label title='Plot height'> h=<input style={{ width: 54 }} type='number' min='80' max='1800' step='20'
						onWheel={(e: any) => setPlot(id, 'height', clamp(80, 1800, (e.target.valueAsNumber || 0) + (e.deltaY < 0 ? 20 : -20)))}
						value={height} onChange={e => setPlot(id, 'height', clamp(80, 1800, e.target.valueAsNumber))}></input></label>
					<label style={{ cursor: 'pointer' }}> tm<input type='checkbox' checked={showTime} onChange={e => setPlot(id, 'showTime', e.target.checked)}/></label>
					<span style={{ position: 'absolute', right: 0, top: 1 }} className='CloseButton' onClick={() =>
						set('plots', settings.plots.filter(p => p.id !== id))}>&times;</span>
				</div> )}
				<button style={{ marginTop: 4, borderColor: 'transparent', color: color('skyblue'), cursor: 'pointer' }}
					onClick={() => set('plots', settings.plots.concat({
						height: 200,
						type: plotsList.find(t => !settings.plots.find(p => p.type === t)) ?? plotsList[0],
						showTime: true,
						id: Date.now()
					}))}>+ <u>add new plot</u></button>
			</div>
			<div style={{ margin: '8px 0' }}>
				<button style={{ padding: '2px 12px' }}
					onClick={() => doExport()}>Open image</button>
				<button style={{ padding: '2px 12px', marginLeft: 12 }}
					onClick={() => doExport(true)}>Download image</button>

			</div>
		</div>
		<div ref={container} style={{ width: settings.width + 6, marginLeft: 8, cursor: 'pointer' }}>
			{settings.plots.map(({ id, type, height }) => {
				const Plot = trivialPlots[type];
				return <div key={id} style={{ height: height + 2, position: 'relative' }}>
					<Plot {...params}/>
				</div>; })}
		</div>

	</div>);
}