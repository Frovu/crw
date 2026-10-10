import { useEffect, useMemo, useState } from 'react';
import { computeCorrelationMatrix } from './regression';
import { color } from '../../app/app';
import { cn } from '../../util';
import { Button } from '../../components/Button';
import type { CorrelationSeries } from './Correlate';

export default function CorrelationMatrix({ series: sets }: { series: CorrelationSeries[] }) {
	const [view, setViewIdx] = useState(0);
	const matrixes = useMemo(() => sets.map(({ X, Y }) => computeCorrelationMatrix(X.map((r, i) => [Y[i], ...r]))), [sets]);

	useEffect(() => {
		if (view >= sets.length) queueMicrotask(() => setViewIdx(0));
	}, [sets, view]);

	const cycleView = () => setViewIdx((v) => (v + 1) % sets.length);

	const { X, cols, R2, weights, errors, sampleName } = sets[view];

	return (
		<>
			<table className="-m-[1px] w-[calc(100%+1px)] [&_td]:w-100 [&_td]:h-8 [&_td]:border [&_td]:break-all [&_td]:text-center">
				<tbody>
					<tr>
						{cols.slice(1).map((col) => (
							<td key={col.name}>{col.name}</td>
						))}
						<td className="text-dark">
							<Button className="w-full" onClick={cycleView}>
								{sampleName}
							</Button>
						</td>
					</tr>
					{matrixes[view].slice(0, -1).map((row, ri) => (
						<tr key={JSON.stringify(row)}>
							{row.slice(1).map((val, ci) => (
								<td
									className={cn([0, 1].includes(val) && 'border-none bg-bg! text-bg', val >= 0.8 && 'text-bg')}
									style={{ backgroundColor: color('cyan', val ** 1.7) }}
									key={`${ci}:${val}`}
								>
									{val.toFixed(2).replace('0.', '.').replace('1.00', '1')}
								</td>
							))}
							<td>
								{ri === 0 ? (
									<Button className="w-full" style={{ color: color(sets[view].color) }} onClick={cycleView}>
										{cols[ri].name}
									</Button>
								) : (
									cols[ri].name
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="px-2">
				<table className="mt-2 [&_td]:w-22 [&_td]:h-8 [&_td]:border [&_td]:break-all [&_td]:text-center">
					<tbody>
						<tr>
							<td className="border-none text-white">
								{R2.toFixed(2)}{' '}
								<span className="text-dark">
									R<sup>2</sup>
								</span>{' '}
							</td>
							{cols.slice(1).map((col) => (
								<td key={col.name}>{col.name}</td>
							))}
						</tr>
						{(
							[
								['wgt', weights],
								['err', errors],
							] as const
						).map(([label, arr]) => (
							<tr key={label}>
								<td className="text-dark">{label}</td>
								{arr.slice(1).map((val) => (
									<td key={val}>{val.toFixed(3).replace('0.', '.')}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				<div className="pt-1 text-dark">[{X.length}]</div>
			</div>
		</>
	);
}
