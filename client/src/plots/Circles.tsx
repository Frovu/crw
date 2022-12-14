import { useRef, useState } from 'react';
import { useSize } from '../util';
import '../css/Circles.css';

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
	return <div ref={ref} style={{ backgroundColor: 'cyan', ...size }}>Test</div>;
}

export default function PlotCirclesStandalone() {
	const params: CirclesParams = { interval: [ new Date('2021-12-06'), new Date('2021-12-12') ] };
	return <div style={{ resize: 'both', height: '100vh', width: '100vw' }}><PlotCircles {...{ params }}/></div>;
}