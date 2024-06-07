import { useContext, useMemo } from 'react';
import { useQuery } from 'react-query';
import { PlotContext, useEventsSettings } from '../events/events';
import { apiGet } from '../util';
import { measureDigit, scaled, axisDefaults, customTimeSplits } from './plotUtil';
import type uPlot from 'uplot';
import { ExportableUplot } from '../events/ExportPlot';
import { color } from '../app';

const colors = {
	north: 'green',
	east: 'purple',
	south: 'acid',
	west: 'magenta'
}

export default function CMEHeightTime() {
	const { interval } = useContext(PlotContext)!;
	const { plotOffset, showGrid } = useEventsSettings();
	const [from, to] = interval.map(d => Math.floor(d.getTime() / 1e3));
	// FIXME

	const query = useQuery(['CMEHT', from, to], () =>
		apiGet<{ time: number, speed: number, width: number, mpa: number, ht: [number, number][] }[]>('events/cme_heighttime', { from, to }));

	const plot = useMemo(() => {
		if (query.isLoading)
			return null;
		const dirColor = (mpa: number) => {
			if (mpa >= 45 && mpa < 135)
				return colors.east;
			if (mpa >= 135 && mpa < 225)
				return colors.south;
			if (mpa >= 225 && mpa < 315)
				return colors.west;
			return colors.north;
		}
		const data = [
			[],
			...(query.data?.map(c => [0, 1].map(i => c.ht.map(r => r[i]))) ?? []),
		] as any;
		const options = () => {
			const ch = measureDigit().width;
			return {
				data,
				mode: 2,
				padding: [scaled(10), scaled(4), 0, 0],
				focus: { alpha: 1 },
				cursor: { focus: { prox: 24 }, drag: { x: false, y: false, setScale: false } },
				plugins: [
				],
				hooks: {
					init: [(u, o, dt) => {
						console.log('init', dt)
					}]
				},
				axes: [ {
					...axisDefaults(showGrid),
					...customTimeSplits(),
				}, {
					...axisDefaults(showGrid),
					size: ch * 2 + scaled(12),
					label: 'Height, Rs'

				} ],
				scales: {
					y: { range: (u, min, max) => [2, max] }
				},
				series: [
					{ }, ...(query.data?.map(c => ({
						scale: 'y',
						stroke: color(dirColor(c.mpa)),
						width: scaled(c.width >= 360 ? 3 : c.width >= 120 ? 2 : 1),
					})) as uPlot.Series[] ?? [])
				]
			} as Omit<uPlot.Options, 'width'|'height'>;
		};
		return <ExportableUplot {...{ options, data: null as any, onCreate: console.log }}/>;
	}, [query.isLoading, query.data, showGrid]);
	
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (!query.data?.length)
		return <div className='Center'>NO CMEs (check coverage)</div>;
	return <div>
		{plot}
	</div>;
}