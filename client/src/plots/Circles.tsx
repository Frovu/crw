import { useRef, useState } from 'react';
import { useSize } from '../util';
import '../css/Circles.css';
import { useQuery } from 'react-query';

type CirclesParams = {
	interval: [Date, Date],
	base?: Date,
	exclude?: string[],
	window?: number,
	minamp?: number 
};

export function PlotCircles({ params }: { params: CirclesParams }) {
	const ref = useRef<HTMLDivElement>(null);
	const size = useSize(ref, 'parent');
	const query = useQuery('ros'+JSON.stringify(params), async () => {
		const urlPara = new URLSearchParams({
			from: (params.interval[0].getTime() / 1000).toFixed(0),
			to:   (params.interval[1].getTime() / 1000).toFixed(0),
			...(params.exclude && { exclude: params.exclude.join() }),
			...(params.window && { window: params.window.toString() }),
			...(params.minamp && { minamp: params.minamp.toString() }),
		}).toString();
		const res = await fetch(process.env.REACT_APP_API + 'api/neutron/ros/?' + urlPara);
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		const data = await res.json();
		console.log(data)
	});
	return <div ref={ref}>Test</div>;
}

export default function PlotCirclesStandalone() {
	const params: CirclesParams = { interval: [ new Date('2021-12-06'), new Date('2021-12-12') ] };
	return <div style={{ resize: 'both', height: '100vh', width: '100vw' }}><PlotCircles {...{ params }}/></div>;
}