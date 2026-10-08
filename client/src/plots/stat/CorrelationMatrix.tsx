import { useEffect, useMemo, useState } from 'react';
import { computeCorrelationMatrix } from './regression';
import type { Column } from '../../api';
import { color } from '../../app/app';
import { cn } from '../../util';
import { Button } from '../../components/Button';
import type { CorrelationParams } from './Correlate';
import { usePlot } from '../../events/core/plot';
import { useFeidSample } from '../../events/core/feid';

type Set = {
	X: number[][];
	Y: number[];
	predictions: number[];
	errors: number[];
	R2: number;
	cols: Column[];
};

export default function CorrelationMatrix({ sets }: { sets: Set[] }) {
	const [view, setViewIdx] = useState(0);
	const params = usePlot<CorrelationParams>();
	const { samples } = useFeidSample();

	const matrixes = useMemo(() => sets.map(({ X, Y }) => computeCorrelationMatrix(X.map((r, i) => [Y[i], ...r]))), [sets]);

	useEffect(() => {
		if (view >= sets.length) queueMicrotask(() => setViewIdx(0));
	}, [sets, view]);

	const cycleView = () => setViewIdx((v) => (v + 1) % sets.length);

	return (
		<table className="-m-[1px] w-[calc(100%+1px)] [&_td]:w-100 [&_td]:h-8 [&_td]:border [&_td]:break-all [&_td]:text-center">
			<tbody>
				<tr>
					{sets[view].cols.slice(1).map((col) => (
						<td>{col.name}</td>
					))}
					<td className="text-dark">
						<Button onClick={cycleView}>
							{samples?.find((s) => s.id === params.correlationY[view].sample)?.name ?? params.correlationY[view].sample}
						</Button>
					</td>
				</tr>
				{matrixes[view].slice(0, -1).map((row, ri) => (
					<tr key={JSON.stringify(row)}>
						{row.slice(1).map((val, ci) => (
							<td
								className={cn([0, 1].includes(val) && 'border-none bg-bg! text-bg', val >= 0.9 && 'text-bg')}
								style={{ backgroundColor: color('cyan', val ** 1.7) }}
								key={`${ci}:${val}`}
							>
								{val.toFixed(2).replace('0.', '.').replace('1.00', '1')}
							</td>
						))}
						<td>
							{ri === 0 ? (
								<Button style={{ color: color(params.correlationY[view].color) }} onClick={cycleView}>
									{sets[view].cols[ri].name}
								</Button>
							) : (
								sets[view].cols[ri].name
							)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
