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
	showSpeed: true,
	showBt: true,
};

export type IMFParams = typeof defaultParams;

function Menu({ Checkbox }: ContextMenuProps<IMFParams>) {
	return (
		<div className="flex flex-wrap max-w-60 gap-x-4">
			<Checkbox label="Show Vsw" k="showSpeed" />
			<Checkbox label="Show |B|" k="showBt" />
			<Checkbox label="Show Bx, By" k="showBxBy" />
			<Checkbox label="Show Bz" k="showBz" />
		</div>
	);
}

function Panel() {
	const params = usePlot<IMFParams>();
	const anyB = params.showBt || params.showBxBy || params.showBz;

	return (
		<BasicPlot
			{...{
				queryKey: ['IMF'],
				queryFn: basicDataQuery('omni', ['time', 'V', 'B', 'Bx', 'By', 'Bz']),
				params,
				axes: () => [
					{
						show: params.showSpeed,
						label: 'Vsw',
						position: [anyB ? 1 / 2 : 0, 1],
						fullLabel: 'Vsw, km/s',
						showGrid: false,
						side: 1,
					},
					{
						show: anyB,
						label: 'IMF',
						position: [0, params.showSpeed ? 3 / 5 : 1],
						fullLabel: `IMF(|B|${params.showBxBy ? ',Bx,By' : ''}${params.showBz ? ',Bz' : ''}), nT`,
						whole: true,
					},
				],
				series: () => [
					{
						show: params.showSpeed,
						label: 'Vsw',
						legend: 'Vsw',
						scale: 'Vsw',
						stroke: color('acid'),
						width: 2,
						marker: 'diamond',
					},
					{
						show: params.showBt,
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
