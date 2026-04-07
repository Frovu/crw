import { useState, useEffect } from 'react';
import { openContextMenu } from '../../app/app';
import { Input, NumberInput, PlotIntervalInput, TextInput } from '../../components/Input';
import type { ScaleParams } from '../../plots/basicPlot';
import { useEventsState } from '../core/eventsState';
import type { EventsPanel } from '../core/util';
import { usePlotExportSate, computePlotsLayout, renderPlotsInCanvas } from './exportablePlots';
import { Button } from '../../components/Button';
import { SimpleSelect } from '../../components/Select';
import { Checkbox } from '../../components/Checkbox';
import { cn } from '../../util';
import TextTransformsList from './TextTransformsList';

async function doExportPlots(inches: number, useCm: boolean, download: boolean = false) {
	const canvas = await renderPlotsInCanvas();
	if (!download) return canvas.toBlob((blob) => blob && window.open(URL.createObjectURL(blob)));
	const a = document.createElement('a');
	const w = Math.round((inches * (useCm ? 2.54 : 1)) / 0.25) * 0.25;
	a.download = `feid_figure_${w.toString().replace('.', 'p')}_${useCm ? 'cm' : 'in'}.png`;
	a.href = canvas.toDataURL()!;
	return a.click();
}

function ControlsPanel() {
	const { overrides, plots, inches, perPlotScales, set, ...stt } = usePlotExportSate();
	const { scale, fontSize, fontFamily, scalesParams } = overrides;
	const { setInches, addScale, setScale, removeScale, setPerPlotMode, restoreScales } = stt;
	const plotId = useEventsState((state) => state.plotId);
	const { width, height } = computePlotsLayout();
	const [useCm, setUseCm] = useState(true);

	useEffect(() => {
		if (plotId != null) restoreScales(plotId);
	}, [restoreScales, plotId]);

	if (plotId == null) return <div className="center">SELECT A FEID EVENT</div>;

	const plotsScales = Object.keys(plots)
		.filter((id) => Object.keys(plots[id].scales).length > 0)
		.map((id) => plots[id].scales);
	const scales: { [k: string]: ScaleParams } = Object.assign({}, ...plotsScales);
	const effectiveScales = Object.entries(scales).map(([scl, params]) => ({ scl, ...(scalesParams?.[scl] ?? params) }));

	const fontPx = Math.round((width / inches / 72) * fontSize * scale);
	const setOverride = (scl: string, param: 'min' | 'max' | 'bottom' | 'top') => (val: number | null) => {
		if (val != null && !isNaN(val)) setScale(plotId, scl, { [param]: val });
	};

	return (
		<div className="p-1 flex flex-col text-sm max-h-full">
			<div className="flex gap-1 text-white overflow-clip">
				<Button variant="default" className="grow h-6" onClick={() => doExportPlots(inches, useCm)}>
					Open png
				</Button>
				<Button variant="default" className="grow h-6" onClick={() => doExportPlots(inches, useCm, true)}>
					Download
				</Button>
			</div>
			{devicePixelRatio !== 1 && (
				<div className="text-red text-xs pt-1">
					devicePixelRatio ({devicePixelRatio.toFixed(2)}) != 1,
					<br /> export might not work as expected
				</div>
			)}
			<div className="flex flex-wrap gap-1 pt-1">
				<div>
					<label title={`Actual font size = ${fontPx}px = ${((fontPx / scale / width) * inches * 72).toFixed(2)}pt`}>
						Font
						<Input
							className="mx-1 w-10"
							type="number"
							min="4"
							max="30"
							value={fontSize}
							onChange={(e) => set('fontSize', e.target.valueAsNumber)}
						/>
						pt
					</label>
					<TextInput
						className="ml-2 w-40"
						placeholder="Roboto Mono"
						value={fontFamily ?? ''}
						onSubmit={(val) => set('fontFamily', val)}
					/>
				</div>
				<div className="flex">
					<label>
						Size
						<Input
							className="ml-1 w-14"
							type="number"
							min="0"
							max="100"
							step={useCm ? 0.5 : 0.25}
							value={Math.round((inches * (useCm ? 2.54 : 1)) / 0.25) * 0.25}
							onChange={(e) => setInches(e.target.valueAsNumber / (useCm ? 2.54 : 1))}
						/>
					</label>
					<Button title="Switch unit" className="px-1" onClick={() => setUseCm(!useCm)}>
						{useCm ? 'cm' : 'in'}
					</Button>
					,
					<label className="flex pl-1" title="Approximate resolution when shrinked to specified size">
						<SimpleSelect
							value={scale}
							options={[2, 3, 4, 6, 8, 10, 16].map(
								(scl) => [scl, `${((width * scl) / inches).toFixed()} ppi (x${scl})`] as const,
							)}
							onChange={(val) => set('scale', val)}
						/>
					</label>
				</div>
			</div>
			<div className="text-dark pb-1">
				image: {width * scale} x {height * scale} px, ≈{' '}
				{((width * height * 0.74 * (scale - 1.2)) / 1024 / 1024).toFixed(2)} MB
			</div>
			<div className="separator mb-1"></div>
			<PlotIntervalInput step={1} />
			<div className="separator mt-1"></div>
			<div className="overflow-y-scroll pb-2">
				<div className="p-0.5 flex items-center gap-2">
					Override scales:
					<Checkbox
						className={cn('text-dark', perPlotScales && 'underline text-magenta')}
						title="Adjust scales for each event individually"
						label="per event"
						checked={perPlotScales}
						onCheckedChange={(val) => setPerPlotMode(plotId, val)}
					/>
				</div>
				<div className="max-w-max text-right flex flex-col gap-0.5 pb-1">
					{effectiveScales
						.sort((a, b) => a.scl.localeCompare(b.scl))
						.map(({ scl, min, max, bottom, top }) => {
							const active = !!scalesParams?.[scl];
							return (
								<div
									key={scl}
									className={cn('pl-1', !active && 'text-dark')}
									onClick={(e) =>
										!(e.target instanceof HTMLInputElement) &&
										(active ? removeScale(plotId, scl) : addScale(plotId, scl, scales[scl]))
									}
								>
									<Button title="Enable override" className={cn('px-1', active && 'underline')}>
										{scl}
									</Button>
									<NumberInput
										className="w-12 mx-0.5"
										disabled={!active}
										title="Scale minimum"
										value={Math.round(min * 100) / 100}
										onChange={setOverride(scl, 'min')}
									/>
									/
									<NumberInput
										className="w-12 mx-0.5"
										disabled={!active}
										title="Scale maximum"
										value={Math.round(max * 100) / 100}
										onChange={setOverride(scl, 'max')}
									/>
									at
									<NumberInput
										className="w-12 mx-0.5"
										disabled={!active}
										title="Position from bottom (0-1)"
										value={Math.round(bottom * 100) / 100}
										onChange={setOverride(scl, 'bottom')}
									/>
									/
									<NumberInput
										className="w-12 mx-0.5"
										disabled={!active}
										title="Top position from bottom (1-0)"
										value={Math.round(top * 100) / 100}
										onChange={setOverride(scl, 'top')}
									/>
								</div>
							);
						})}
				</div>
				<div className="separator" />
				<TextTransformsList />
			</div>
		</div>
	);
}

function ControlsMenu() {
	return (
		<>
			<Button onClick={openContextMenu('textTransform', { action: 'save' }, true)}>Save text replaces</Button>
			<Button onClick={openContextMenu('textTransform', { action: 'load' }, true)}>Load text replaces</Button>
		</>
	);
}

export const ExportControls: EventsPanel<{}> = {
	name: 'Export Controls',
	Panel: ControlsPanel,
	Menu: ControlsMenu,
};
