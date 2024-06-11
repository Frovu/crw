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
			const ch = measureDigit().width, scale = scaled(1);
			return {
				data,
				mode: 2,
				padding: [scaled(10), scaled(6), 0, 0],
				focus: { alpha: 1 },
				cursor: { focus: { prox: 24 }, drag: { x: false, y: false, setScale: false } },
				hooks: {
					drawAxes: [(u) => {
						const { ctx, bbox } = u;
						ctx.save();
						ctx.fillStyle = color('bg');
						ctx.strokeStyle = color('grid');
						ctx.lineWidth = 2;
						const px = (a: number) => a * scale;
						const x = bbox.left, y = px(4), w = px(30), h = px(28);
						const margin = px(0);
						ctx.fillRect(x, y, w, h);
						ctx.fillStyle = color(colors.north);
						ctx.textAlign = 'center';
						ctx.textBaseline = 'top';
						ctx.fillText('N', x + w / 2, y + margin);
						ctx.textBaseline = 'bottom';
						ctx.fillStyle = color(colors.south);
						ctx.fillText('S', x + w / 2, y + h - margin);
						ctx.textBaseline = 'middle';
						ctx.textAlign = 'left';
						ctx.fillStyle = color(colors.west);
						ctx.fillText('W', x + margin, y + h / 2);
						ctx.fillStyle = color(colors.east);
						ctx.textAlign = 'right';
						ctx.fillText('E', x + w - margin, y + h / 2);
						ctx.restore();
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