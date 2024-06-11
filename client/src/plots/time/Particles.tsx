
import { useEventsSettings, type PanelParams } from '../../events/events';
import { useFeidCursor, useSource } from '../../events/eventsState';
import type { ContextMenuProps } from '../../layout';
import { apiGet } from '../../util';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color, superScript } from '../plotUtil';

const defaultParams = {
}

export type SatPartParams = BasicPlotParams & Partial<typeof defaultParams>;

export function ParticlesContextMenu({ params, setParams }: ContextMenuProps<Partial<SatPartParams>>) {
	// const { mode } = { ...defaultParams, ...params };

	return <div className='Group'>

	</div>;
}

export default function ParticlesPlot({ params }: { params: SatPartParams }) {
	const { showGrid, showTimeAxis } = { ...defaultParams, ...params };
	const { plotOffset } = useEventsSettings();
	const erupt = useSource('sources_erupt');
	const { start: feidTime } = useFeidCursor();
	const interval = plotOffset.map(o => new Date((feidTime?.getTime() ?? 0) + o * 36e5)) as [Date, Date];

	return (<BasicPlot {...{
		queryKey: ['satparticles'],
		queryFn: () => basicDataQuery('omni/particles', interval, ['time', 'p5', 'p7']),
		params: {
			...params,
			interval,
			onsets: [],
			clouds: [],
		},
		axes: () => [
		],
		series: () => [
		]
	}}/>);
}