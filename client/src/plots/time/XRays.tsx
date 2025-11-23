import { usePlot, type FlareOnset } from '../../events/core/plot';
import { useSolarPlot } from '../../events/core/plot';
import { serializeCoords } from '../../events/core/sourceActions';
import type { EventsPanel } from '../../events/core/util';
import type { ContextMenuProps } from '../../layout';
import { basicDataQuery, type BasicPlotParams } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, font, scaled } from '../plotUtil';
import uPlot from 'uplot';

const defaultParams = {
	showShortXrays: true,
};

export type SatXraysParams = typeof defaultParams;

function Menu({ Checkbox }: ContextMenuProps<SatXraysParams>) {
	return <Checkbox label="Show short wavelength" k="showShortXrays" />;
}

export function flaresOnsetsPlugin({
	params,
	flares,
	focusTime,
}: {
	params: BasicPlotParams;
	flares: FlareOnset[];
	focusTime: Date;
}): uPlot.Plugin {
	const { showMetaInfo, showMetaLabels } = params;
	const scale = scaled(1);
	const px = (a: number) => a * scale;
	return {
		hooks: {
			drawSeries: [
				(u, si) => {
					if (si !== 1 || !showMetaInfo) return;
					const ctx = u.ctx;
					ctx.save();
					ctx.beginPath();
					ctx.font = font(px(12));
					ctx.lineWidth = px(1);
					ctx.textAlign = 'right';
					ctx.textBaseline = 'bottom';
					ctx.lineCap = 'round';
					const { width: w } = ctx.measureText('99E99W');
					const hl = px(16);
					let lastX = 0,
						lastY = 0,
						lastSrc = '';
					for (const { time, flare } of flares) {
						ctx.stroke();
						ctx.beginPath();
						const col =
							focusTime.getTime() === time.getTime()
								? 'active'
								: ['A', 'B', 'C'].includes((flare.class ?? 'A')[0])
								? 'dark'
								: 'white';
						ctx.strokeStyle = ctx.fillStyle = color(col);
						const tm = (flare.peak_time?.getTime() ?? time.getTime()) / 1e3;
						const x = u.valToPos(tm, 'x', true);
						const y = u.valToPos(u.data[1][u.valToIdx(tm)]!, 'xray', true);
						ctx.moveTo(x, y - px(1));
						ctx.lineTo(x, y - hl / 2);
						if (showMetaLabels && x - lastX < w && Math.abs(y - lastY) < px(12)) continue;
						if (showMetaLabels && x - lastX < w && flare.src !== lastSrc) continue;
						ctx.lineTo(x, y - hl);
						if (showMetaLabels) {
							if (y < px(24)) {
								ctx.beginPath();
								ctx.moveTo(x, y - px(2));
								ctx.lineTo(x - hl / 2, y - px(2));
								ctx.fillText(serializeCoords(flare), x - hl / 2 - px(2), y + px(8));
							} else {
								ctx.fillText(serializeCoords(flare), x + px(18), y - hl);
							}
						}
						lastY = y;
						lastX = x;
						lastSrc = flare.src;
					}
					ctx.stroke();
					ctx.restore();
				},
			],
		},
	};
}

function Panel() {
	const params = usePlot<SatXraysParams>();
	const { showGrid, showShortXrays } = params;
	const { interval, flares, focusTime } = useSolarPlot();

	return (
		<BasicPlot
			{...{
				queryKey: (interv) => ['satxrays', interv],
				queryFn: (interv) => basicDataQuery('omni/xrays', interv, ['time', 'l', 's']),
				params: {
					...params,
					interval,
					onsets: [],
					clouds: [],
				},
				options: () => ({
					padding: [scaled(8), scaled(6), 0, 0],
					plugins: [flaresOnsetsPlugin({ params, flares, focusTime })],
				}),
				axes: () => [
					{
						...axisDefaults(showGrid, (u, splits) => splits.map((s) => (Math.log10(s) % 1 === 0 ? s : null))),
						label: 'xray',
						fullLabel: 'X-Ray, W/m²',
						distr: 3,
						gap: scaled(4),
						// minMax: [null, 1e-5],
						values: (u, vals) =>
							vals.map((v) =>
								Math.log10(v) % 1 === 0 ? ['A', 'B', 'C', 'M', 'X'][Math.log10(v) + 8] ?? '' : ''
							),
					},
				],
				series: () => [
					{
						label: 'l',
						scale: 'xray',
						legend: '1 - 8 Å',
						stroke: color('magenta'),
					},
					{
						show: showShortXrays,
						label: 's',
						scale: 'xray',
						legend: '.5 - 4 Å',
						stroke: color('purple'),
					},
				],
			}}
		/>
	);
}

export const XraysPlot: EventsPanel<SatXraysParams> = {
	name: 'X-Rays',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
	isSolar: true,
};
