import { usePlot } from '../../events/core/plot';
import { useSolarPlot } from '../../events/core/plot';
import type { ContextMenuProps } from '../../layout';
import { basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, scaled } from '../plotUtil';
import { flaresOnsetsPlugin } from '../solar';

const defaultParams = {
	showShortXrays: true,
};

export type SatXraysParams = typeof defaultParams;

function Menu({ Checkbox }: ContextMenuProps<SatXraysParams>) {
	return (
		<div className="Group">
			<Checkbox text="Show short wavelength" k="showShortXrays" />
		</div>
	);
}

function Panel() {
	const params = usePlot<SatXraysParams>();
	const { showGrid, showShortXrays } = params;
	const { interval, flares, focusTime } = useSolarPlot();

	return (
		<BasicPlot
			{...{
				queryKey: ['satxrays'],
				queryFn: () => basicDataQuery('omni/xrays', interval, ['time', 'l', 's']),
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
