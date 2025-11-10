import { usePlotParams, type EventsPanel } from '../../events/core/eventsSettings';
import type { ContextMenuProps } from '../../layout';
import { type CustomSeries, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color } from '../plotUtil';

const defaultParams = {
	showBz: true,
	showBxBy: false,
};

export type IMFParams = typeof defaultParams;

function Menu({ Checkbox }: ContextMenuProps<IMFParams>) {
	return (
		<div className="Group">
			<Checkbox text="Show Bx, By" k="showBxBy" />
			<Checkbox text="Show Bz" k="showBz" />
		</div>
	);
}

function Panel() {
	const params = usePlotParams<IMFParams>();
	return (
		<BasicPlot
			{...{
				queryKey: ['IMF'],
				queryFn: () => basicDataQuery('omni', params.interval, ['time', 'sw_speed', 'imf_scalar', 'imf_x', 'imf_y', 'imf_z']),
				params,
				axes: () => [
					{
						label: 'Vsw',
						position: [1 / 2, 1],
						fullLabel: 'Vsw, km/s',
						showGrid: false,
						side: 1,
					},
					{
						label: 'IMF',
						position: [0, 3 / 5],
						fullLabel: `IMF(|B|${params.showBxBy ? ',Bx,By' : ''}${params.showBz ? ',Bz' : ''}), nT`,
						whole: true,
					},
				],
				series: () => [
					{
						label: 'Vsw',
						legend: 'Vsw',
						scale: 'Vsw',
						stroke: color('acid'),
						width: 2,
						marker: 'diamond',
					},
					{
						label: '|B|',
						legend: 'IMF |B|',
						scale: 'IMF',
						stroke: color('purple'),
						width: 2,
						marker: 'circle',
					},
					...[
						['Bx', 'green', 'triangleDown'],
						['By', 'cyan', 'triangleUp'],
						['Bz', 'magenta', 'square'],
					].map(
						([label, stroke, marker]) =>
							({
								show: label === 'Bz' ? params.showBz : params.showBxBy,
								label,
								legend: `IMF  ${label}`,
								scale: 'IMF',
								stroke: color(stroke),
								marker,
							} as CustomSeries)
					),
				],
			}}
		/>
	);
}

export const IMFPlot: EventsPanel<IMFParams> = {
	name: 'IMF + Speed',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
};
