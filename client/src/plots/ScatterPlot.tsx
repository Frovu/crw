import { useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import * as APP from '../app/app';
import { useSize } from '../util';
import { axisDefaults, color } from './common/plotUtil';

export function ScatterPlot({ data, colour }: { data: [number[], number[]][]; colour: (typeof APP.colorKeys)[number] }) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);
	return (
		<div ref={setContainer} style={{ position: 'absolute' }}>
			<UplotReact
				data={[[], ...data] as any}
				options={{
					...size,
					mode: 2,
					padding: [8, 8, 0, 0],
					legend: { show: false },
					cursor: { show: false },
					axes: [
						{
							...axisDefaults(true),
							ticks: { show: false },
							scale: 'x',
							size: 24,
						},
						{
							...axisDefaults(true),
							ticks: { show: false },
							scale: 'y',
							size: 30,
						},
					],
					scales: {
						x: {
							time: false,
						},
						y: {
							range: (u, min, max) => [min, max],
						},
					},
					series: [
						{},
						{
							fill: color(colour),
							width: 1,
							paths: uPlot.paths.points!(),
						},
						{
							stroke: color('white'),
							width: 1,
							paths: uPlot.paths.linear!({ alignGaps: 1 }),
						},
					],
				}}
			/>
		</div>
	);
}
