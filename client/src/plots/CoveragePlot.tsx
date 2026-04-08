import UplotReact from 'uplot-react';
import uPlot from 'uplot';
import { useEffect, useMemo, useState } from 'react';
import { cn, useSize } from '../util';
import { color } from '../app/app';

export default function CoveragePlot({
	className,
	time,
	data,
	color: colorDict,
}: {
	className?: string;
	time: number[];
	data: (number | null)[];
	color: { [key: number]: string };
}) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const [upl, setUpl] = useState<uPlot | null>(null);
	useEffect(() => {
		upl && upl.setSize(size);
	}, [upl, size.height, size.width]); // eslint-disable-line

	const options: uPlot.Options = useMemo(
		() => ({
			...size,
			padding: [-1, 0, 0, 0],
			legend: { show: false },
			cursor: { show: false },
			axes: [
				{
					show: false,
				},
				{ show: false },
			],
			scales: { y: { range: () => [0, 1] } },
			series: [
				{},
				{
					label: 'asd',
					stroke: color('red'),
					paths: uPlot.paths.bars!({
						align: 1,
						disp: {
							y0: {
								unit: 1,
								values: (u, sidx) => u.data[sidx].map((v) => 0) as any,
							},
							y1: {
								unit: 1,
								values: (u, sidx) => u.data[sidx].map((v) => 1) as any,
							},
							stroke: {
								unit: 3,
								values: (u, sidx) => u.data[sidx].map((v) => colorDict[v!] as any) as any,
							},
							fill: {
								unit: 3,
								values: (u, sidx) => u.data[sidx].map((v) => colorDict[v!] as any) as any,
							},
						},
					}),
				},
			],
		}),
		[],
	);

	return (
		<div className={cn('relative bg-input-bg', className)}>
			<div ref={setContainer} className="absolute">
				<UplotReact onCreate={setUpl} data={[time, data]} options={options} />
			</div>
		</div>
	);
}
