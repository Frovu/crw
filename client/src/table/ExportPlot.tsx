import { useContext, useMemo, useRef, useState } from 'react';
import { useEventListener, usePersistedState } from '../util';
import PlotSW from '../plots/SW';
import PlotIMF from '../plots/IMF';
import PlotGSM from '../plots/GSM';
import PlotGSMAnisotropy from '../plots/GSMAnisotropy';
import PlotGeoMagn from '../plots/Geomagn';
import { PlotCircles } from '../plots/Circles';
import { PlotContext, SettingsContext, plotParamsFromSettings } from './Table';

// const trivialPlots = ['Solar Wind', 'SW Plasma', 'Cosmic Rays', 'CR Anisotropy', 'Geomagn', 'Ring of Stations'] as const;
const trivialPlots = {
	'Solar Wind': PlotIMF,
	'SW Plasma': PlotSW,
	'Cosmic Rays': PlotGSM,
	'CR Anisotropy': PlotGSMAnisotropy,
	'Geomagn': PlotGeoMagn,
	'Ring of Stations': PlotCircles
};

type PlotSettings = {
	type: keyof typeof trivialPlots,
	height: number
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
	}, {
		type: 'Cosmic Rays',
		height: 200,
	}, {
		type: 'Geomagn',
		height: 100,
	}, {
		type: 'Ring of Stations',
		height: 300,
	}]
});

export default function PlotExportView({ escape }: { escape: () => void }) {
	const { settings: tableSettings } = useContext(SettingsContext);
	const plotContext = useContext(PlotContext);
	// const [settings, setSettings] = usePersistedState('tableColEnabled', defaultSettings);
	// useEventListener('action+resetSettings', () => setSettings(defaultSettings()));
	const settings = defaultSettings();
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
		canvas.width = settings.width;
		canvas.height = settings.plots.reduce((s, a) => s + a.height, 0);
		const ctx = canvas.getContext('2d')!;
		let y = 0;
		settings.plots.forEach((plot, i) => {
			const plotCanvas = container.current!.children[i].querySelector('canvas');
			if (!plotCanvas) return;
			ctx.drawImage(plotCanvas, 0, y);
			y += plot.height;
		});

		const a = document.createElement('a');
		if (download)
			a.download = 'aid_compound_plot.png';
		else
			a.target = '_blank';
		a.href = canvas.toDataURL()!;
		a.click();
	};

	return (<div style={{ display: 'flex', width: settings.width + 320 + 8, padding: 8 }}>
		<div style={{ width: 320 }}>
			<div style={{ padding: 8 }}>
				<button style={{ padding: '2px 12px' }}
					onClick={() => doExport()}>Open image</button>
				<button style={{ padding: '2px 12px', marginLeft: 12 }}
					onClick={() => doExport(true)}>Download image</button>

			</div>
		</div>
		<div ref={container} style={{ width: settings.width + 6, marginLeft: 8 }}>
			{settings.plots.map(pl =>
				<div key={pl.type} style={{ height: pl.height + 2 }}>
					{trivialPlots[pl.type](params)}
				</div>)}
			
		</div>

	</div>);
}