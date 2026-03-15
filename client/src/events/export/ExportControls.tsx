import { useState, useEffect, type ChangeEvent } from 'react';
import { color, openContextMenu } from '../../app';
import { PlotIntervalInput } from '../../components/Input';
import type { ScaleParams } from '../../plots/basicPlot';
import { useEventsState } from '../core/eventsState';
import type { EventsPanel } from '../core/util';
import { usePlotExportSate, computePlotsLayout, renderPlotsInCanvas } from './exportablePlots';

function ControlsPanel() {
	const {
		overrides: { scale, fontSize, fontFamily, textTransform, scalesParams },
		plots,
		inches,
		perPlotScales,
		setInches,
		set,
		setTransform,
		swapTransforms,
		addScale,
		setScale,
		removeScale,
		setPerPlotMode,
		restoreScales,
	} = usePlotExportSate();
	const plotId = useEventsState((state) => state.plotId);
	const { width, height } = computePlotsLayout();
	const [useCm, setUseCm] = useState(true);
	const [dragging, setDragging] = useState<number | null>(null);

	useEffect(() => {
		if (plotId != null) restoreScales(plotId);
	}, [restoreScales, plotId]);

	if (plotId == null) return <div>plotId is null</div>;

	async function doExportPlots(download: boolean = false) {
		const canvas = await renderPlotsInCanvas();
		if (!download) return canvas.toBlob((blob) => blob && window.open(URL.createObjectURL(blob)));
		const a = document.createElement('a');
		const w = Math.round((inches * (useCm ? 2.54 : 1)) / 0.25) * 0.25;
		a.download = `feid_figure_${w.toString().replace('.', 'p')}_${useCm ? 'cm' : 'in'}.png`;
		a.href = canvas.toDataURL()!;
		return a.click();
	}
	const plotsScales = Object.keys(plots)
		.filter((id) => Object.keys(plots[id].scales).length > 0)
		.map((id) => plots[id].scales);
	const scales: { [k: string]: ScaleParams } = Object.assign({}, ...plotsScales);
	const effectiveScales = Object.entries(scales).map(([scl, params]) => ({ scl, ...(scalesParams?.[scl] ?? params) }));

	const fontPx = Math.round((width / inches / 72) * fontSize * scale);
	const setOverride = (scl: string, param: 'min' | 'max' | 'bottom' | 'top') => (e: ChangeEvent<HTMLInputElement>) => {
		const val = parseFloat(e.target.value);
		if (!isNaN(val)) setScale(plotId, scl, { [param]: val });
	};

	return (
		<div style={{ padding: 4, display: 'flex', flexDirection: 'column', fontSize: 14, maxHeight: '100%' }}>
			<div>
				<div style={{ display: 'flex', gap: 4, color: color('white') }}>
					<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots()}>
						Open png
					</button>
					<button style={{ flex: 1, minWidth: 'max-content' }} onClick={() => doExportPlots(true)}>
						Download
					</button>
				</div>
				{devicePixelRatio !== 1 && (
					<div style={{ fontSize: 12, color: color('red') }}>
						pixelRatio ({devicePixelRatio.toFixed(2)}) != 1, export won't work as expected, press Ctrl+0 if it helps
					</div>
				)}
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 4 }}>
					<span>
						<label
							title={`Actual font size = ${fontPx}px = ${((fontPx / scale / width) * inches * 72).toFixed(2)}pt`}
						>
							Font
							<input
								style={{ width: 42, margin: '0 4px' }}
								type="number"
								min="6"
								max="24"
								value={fontSize}
								onChange={(e) => set('fontSize', e.target.valueAsNumber)}
							/>
							pt
						</label>
						<input
							type="text"
							style={{ marginLeft: 8, width: 148 }}
							placeholder="Roboto Mono"
							value={fontFamily ?? ''}
							onChange={(e) => set('fontFamily', e.target.value || undefined)}
						/>
					</span>
					<span>
						<label>
							Size
							<input
								style={{ width: 56, marginLeft: 4 }}
								type="number"
								min="0"
								max="100"
								step={useCm ? 0.5 : 0.25}
								value={Math.round((inches * (useCm ? 2.54 : 1)) / 0.25) * 0.25}
								onChange={(e) => setInches(e.target.valueAsNumber / (useCm ? 2.54 : 1))}
							/>
						</label>
						<label style={{ padding: '0 4px' }}>
							{useCm ? 'cm' : 'in'}
							<input hidden type="checkbox" checked={useCm} onChange={(e) => setUseCm(e.target.checked)} />
						</label>
						,
						<label style={{ paddingLeft: 4 }} title="Approximate resolution when shrinked to specified size">
							<select
								style={{ marginLeft: 2, marginRight: 2, width: 86 }}
								value={scale}
								onChange={(e) => set('scale', parseInt(e.target.value))}
							>
								{[2, 3, 4, 6, 8, 10, 16].map((scl) => (
									<option key={scl} value={scl}>
										{((width * scl) / inches).toFixed()} ppi
									</option>
								))}
							</select>
							<span style={{ color: color('dark') }}>({scale}x)</span>
						</label>
					</span>
				</div>
				<div style={{ color: color('dark'), paddingTop: 2 }}>
					image: {width * scale} x {height * scale} px, ≈{' '}
					{((width * height * 0.74 * (scale - 1.2)) / 1024 / 1024).toFixed(2)} MB
				</div>
				<div className="separator"></div>
				<PlotIntervalInput step={1} />
				<div className="separator"></div>
			</div>
			<div style={{ overflowY: 'scroll', paddingBottom: 8 }}>
				<span style={{ color: color('dark') }}>
					Override scales:
					<label
						title="Adjust scales for each event individually"
						style={{
							display: 'inline-block',
							textDecoration: perPlotScales ? 'underline' : 'unset',
							marginLeft: 8,
							color: perPlotScales ? color('magenta') : 'inherit',
						}}
					>
						per event
						<input
							type="checkbox"
							checked={perPlotScales}
							onChange={(e) => setPerPlotMode(plotId, e.target.checked)}
						/>
					</label>
				</span>
				<div style={{ maxWidth: 'max-content', textAlign: 'right' }}>
					{effectiveScales
						.sort((a, b) => a.scl.localeCompare(b.scl))
						.map(({ scl, min, max, bottom, top }) => {
							const active = !!scalesParams?.[scl];
							return (
								<div
									key={scl}
									style={{ cursor: 'pointer', color: !active ? color('dark') : 'unset' }}
									onClick={(e) =>
										!(e.target instanceof HTMLInputElement) &&
										(active ? removeScale(plotId, scl) : addScale(plotId, scl, scales[scl]))
									}
								>
									<span style={{ textDecoration: !active ? 'unset' : 'underline' }}>{scl}</span>
									<input
										disabled={!active}
										title="Scale minimum"
										style={{ width: 54, marginTop: 2, marginLeft: 8 }}
										type="text"
										value={(Math.round(min * 100) / 100).toString()}
										onChange={setOverride(scl, 'min')}
									/>
									/
									<input
										disabled={!active}
										title="Scale maximum"
										style={{ width: 54, marginRight: 4 }}
										type="text"
										value={(Math.round(max * 100) / 100).toString()}
										onChange={setOverride(scl, 'max')}
									/>
									<div style={{ display: 'inline-block' }}>
										at
										<input
											disabled={!active}
											title="Position from bottom (0-1)"
											style={{ width: 32, marginTop: 2, marginLeft: 4 }}
											type="text"
											value={(Math.round(bottom * 100) / 100).toString().replace('0.', '.')}
											onChange={setOverride(scl, 'bottom')}
										/>
										/
										<input
											disabled={!active}
											title="Top position from bottom (1-0)"
											style={{ width: 32 }}
											type="text"
											value={(Math.round(top * 100) / 100).toString().replace('0.', '.')}
											onChange={setOverride(scl, 'top')}
										/>
									</div>
								</div>
							);
						})}
				</div>
				<div className="separator" />
				<div
					style={{ display: 'flex', flexFlow: 'column wrap', gap: 4, minWidth: 160, paddingTop: 4, paddingRight: 8 }}
					onMouseUp={() => setDragging(null)}
					onMouseLeave={() => setDragging(null)}
				>
					<div
						style={{
							textAlign: 'right',
							marginTop: -8,
							padding: '0 8px',
							display: 'flex',
							flexWrap: 'wrap',
							justifyContent: 'space-between',
						}}
					>
						<button
							title="Load saved or public transforms (replace current)"
							className="TextButton"
							style={{ padding: '0 6px', color: color('skyblue') }}
							onClick={openContextMenu('textTransform', { action: 'load' })}
						>
							<u>load</u>
						</button>
						<button
							title="Save text transorms for future reuse or sharing"
							className="TextButton"
							disabled={!textTransform?.length}
							style={{ padding: '0 6px', color: color(!textTransform?.length ? 'dark' : 'skyblue') }}
							onClick={openContextMenu('textTransform', { action: 'save' })}
						>
							<u>save</u>
						</button>
						<div
							title="Some characters, if thou mightst need em"
							style={{
								userSelect: 'text',
								letterSpacing: 2,
								fontSize: 16,
								paddingRight: 8,
								color: color('dark'),
							}}
						>
							−+±×⋅·∙⋆°
						</div>
						<button
							title="Replace text in labels via Regular Expressions which are applied to labels parts"
							className="TextButton"
							style={{ color: color('skyblue') }}
							onClick={() =>
								set(
									'textTransform',
									[
										{
											search: '',
											replace: '',
											enabled: true,
											id: Date.now(),
										},
									].concat(textTransform ?? []),
								)
							}
						>
							+ <u>new replace</u>
						</button>
					</div>
					{textTransform?.map(({ search, replace, id, enabled }) => (
						<div
							key={id}
							style={{
								color: !enabled ? color('dark') : 'unset',
								display: 'flex',
								gap: 4,
								flexFlow: 'row wrap',
								alignItems: 'center',
							}}
							title="Drag to change replacement order"
							onMouseOver={(e) => {
								if (dragging && dragging !== id) swapTransforms(dragging, id);
							}}
							onMouseDown={(e) => !(e instanceof HTMLInputElement) && setDragging(id)}
						>
							<label style={{ minWidth: 'max-content' }}>
								<input
									type="checkbox"
									checked={!!enabled}
									onChange={(e) => setTransform(id, { enabled: e.target.checked })}
								/>
								RegEx
							</label>
							<input
								disabled={!enabled}
								type="text"
								style={{ flex: 2, minWidth: '4em', maxWidth: '10em' }}
								placeholder="search"
								title="Dont forget to escape special characters with a \, like \(. Start with whitespace to target legend only."
								value={search}
								onChange={(e) => setTransform(id, { search: e.target.value })}
							/>
							<div
								style={{
									flex: '2 10em',
									gap: 4,
									alignItems: 'center',
									minWidth: 'min(10em, 50%)',
									maxWidth: '20em',
									display: 'flex',
								}}
							>
								<span style={{ cursor: 'grab' }}>-&gt;</span>
								<input
									disabled={!enabled}
									type="text"
									style={{ flex: 1, minWidth: 0 }}
									placeholder="replace"
									title="Following tags are supported: <i> <b> <sup> <sub>"
									value={replace}
									onChange={(e) => setTransform(id, { replace: e.target.value })}
								/>
								<span
									style={{ marginLeft: -2, marginTop: -2 }}
									className="CloseButton"
									onClick={() =>
										set(
											'textTransform',
											textTransform.filter((t) => t.id !== id),
										)
									}
								></span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function ControlsMenu() {
	return (
		<>
			<button onClick={openContextMenu('textTransform', { action: 'save' }, true)}>Save replaces</button>
			<button onClick={openContextMenu('textTransform', { action: 'load' }, true)}>Load replaces</button>
		</>
	);
}

export const ExportControls: EventsPanel<{}> = {
	name: 'Export Controls',
	Panel: ControlsPanel,
	Menu: ControlsMenu,
};
