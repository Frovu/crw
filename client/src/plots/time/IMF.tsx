import { usePlot } from '../../events/core/plot';
import type { EventsPanel } from '../../events/core/util';
import type { ContextMenuProps } from '../../app/layout';
import { basicDataQuery } from '../common/basicPlot';
import BasicPlot from '../common/BasicPlot';
import { color } from '../common/plotUtil';
import type { CustomSeries } from '../common/types';

const defaultParams = {
	showBz: true,
	showBxBy: false,
};

export type IMFParams = typeof defaultParams;

function Menu({ Checkbox }: ContextMenuProps<IMFParams>) {
	return (
		<>
			<Checkbox label="Show Bx, By" k="showBxBy" />
			<Checkbox label="Show Bz" k="showBz" />
		</>
	);
}

function Panel() {
	const params = usePlot<IMFParams>();

	return (
		<BasicPlot
			{...{
				queryKey: ['IMF'],
				queryFn: basicDataQuery('omni', ['time', 'V', 'B', 'Bx', 'By', 'Bz']),
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
					...(
						[
							['Bx', 'green', 'triangleDown'],
							['By', 'cyan', 'triangleUp'],
							['Bz', 'magenta', 'square'],
						] as const
					).map(
						([label, stroke, marker]) =>
							({
								show: label === 'Bz' ? params.showBz : params.showBxBy,
								label,
								legend: `IMF  ${label}`,
								scale: 'IMF',
								stroke: color(stroke),
								marker,
							}) as CustomSeries,
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
