import { keepPreviousData, useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';
import { color, font } from '../../plots/plotUtil';
import UplotReact from 'uplot-react';
import { apiGet, prettyDate, useEventListener } from '../../util';
import { useContext, useEffect, useState } from 'react';
import { NeutronContext } from './Neutron';

export default function MinuteView({ timestamp, station }: { timestamp: number; station: string }) {
	const { data: allData, stations, addCorrection } = useContext(NeutronContext)!;

	const query = useQuery({
		queryKey: ['minuteView', timestamp, station],
		placeholderData: keepPreviousData,
		queryFn: async () => {
			const body = (await apiGet('neutron/minutes', {
				timestamp: timestamp.toString(),
				station,
			})) as { station: string; raw: number[]; filtered: number[]; integrated: number; idx: number; stateValue: number };
			body.idx = allData[0].indexOf(timestamp);
			body.stateValue = allData[1 + stations.indexOf(station)][body.idx];
			return body.raw ? body : null;
		},
	});

	const [value, setValue] = useState(0);
	const [mask, setMask] = useState(Array(60).fill(false));
	useEffect(() => setMask(Array(60).fill(false)), [query.data]);
	useEffect(() => {
		if (query.data) setValue(query.data.stateValue);
	}, [query.data]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code === 'KeyI') {
			if (query.data && query.data.stateValue !== value) addCorrection(station, query.data!.idx, [value]);
		}
	});

	if (query.isLoading) return <div className="center">LOADING..</div>;
	if (query.isError)
		return (
			<div className="center" style={{ color: color('red') }}>
				FAILED TO LOAD
			</div>
		);
	if (query.data == null) return <div className="center">NO DATA</div>;

	const effective = query.data.filtered.map((v, i) => (mask[i] ? null : v));
	const data = [
		Array.from(Array(60).keys()),
		Array(60).fill(value),
		Array(60).fill(query.data.integrated),
		Array(60).fill(query.data.stateValue),
		effective,
		query.data.filtered.map((v, i) => (mask[i] ? v : null)),
		query.data.raw.map((v, i) => (v === query.data?.filtered[i] ? null : v)),
	];

	const options = {
		width: 356,
		height: 240,
		legend: { show: false },
		padding: [8, 8, 0, 0],
		cursor: {
			points: {
				size: 6,
				fill: color('acid'),
				stroke: color('acid'),
			},
			drag: { dist: 8, y: true },
			bind: {
				mouseup: (u: uPlot, targ, handler) => {
					return (e) => {
						if (e.button === 0) {
							if (e.shiftKey || e.ctrlKey) {
								u.cursor.drag!.setScale = false;
								handler(e);
								u.cursor.drag!.setScale = true;
							} else {
								handler(e);
							}
							return null;
						}
					};
				},
			},
		},
		hooks: {
			setSelect: [
				(u: uPlot) => {
					if (u.select.width <= 0) return;
					const left = u.posToIdx(u.select.left);
					const right = u.posToIdx(u.select.left + u.select.width);
					setMask((oldMask) => {
						const msk = oldMask.slice();
						for (let i = left; i <= right; ++i) msk[i] = !msk[i];
						const eff = query.data!.filtered.filter((v, i) => !msk[i] && v != null);
						setValue(eff.reduce((a, b) => a + b, 0) / eff.length);
						return msk;
					});

					u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
				},
			],
			ready: [
				(u: uPlot) => u.setCursor({ left: -1, top: -1 }), // ??
			],
		},
		scales: {
			x: { time: false },
			y: {
				range: (u, min, max) => [min - 2, max + 2],
			},
		},
		axes: [
			{
				size: 34,
				font: font(),
				stroke: color('text'),
				grid: { show: true, stroke: color('grid'), width: 2 },
				ticks: { stroke: color('grid'), width: 2 },
				values: (u, vals) => [
					'',
					'',
					`${query.data!.station.toUpperCase()} minutes of ${prettyDate(timestamp)}`,
					'',
					'',
					`[${query.data!.filtered.reduce((s, a) => s + (a == null ? 0 : 1), 0)}/60]`,
				],
			},
			{
				size: 40,
				gap: 0,
				values: (u, vals) => vals.map((v) => v.toFixed(0)),
				font: font(),
				stroke: color('text'),
				grid: { show: true, stroke: color('grid'), width: 2 },
			},
		],
		series: [
			{ stroke: color('text') },
			{
				width: 2,
				stroke: color('gold'),
				points: { show: false },
			},
			{
				width: 2,
				stroke: color('orange'),
				points: { show: false },
			},
			{
				width: 2,
				stroke: color('green'),
				points: { show: false },
			},
			{
				stroke: color('cyan'),
				points: { show: true, fill: color('bg'), stroke: color('cyan') },
			},
			{
				stroke: color('purple'),
				points: { show: true, fill: color('bg'), stroke: color('purple') },
			},
			{
				stroke: color('magenta'),
				points: { size: 8, show: true, fill: color('magenta'), stroke: color('magenta') },
			},
		],
	} as uPlot.Options;

	return (
		<div style={{ position: 'absolute' }}>
			<UplotReact {...{ options, data: data as any }} />
		</div>
	);
}
