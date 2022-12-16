import { useState } from 'react';
import { useQuery } from 'react-query';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { useSize } from '../util';
import { axisDefaults, color, drawOnset } from './plotUtil';

type GSMParams = {
	interval: [Date, Date],
	onset: Date,
	interactive?: boolean
};

function gsmPlotOptions(size: { width: number, height: number }, params: GSMParams): uPlot.Options {
	return {
		...size,
		padding: [8, 8, 0, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			draw: [ u => (params.onset) && drawOnset(u, params.onset) ],
		},
		axes: [
			{
				...axisDefaults(),
				space: 64,
				size: 40,
				values: (u, vals) => vals.map((v, i) => {
					const d = new Date(v * 1000);
					const day = String(d.getUTCDate()).padStart(2, '0');
					const hour =  String(d.getUTCHours()).padStart(2, '0');
					return (i === 1 ? d.toLocaleString('en-us', { year: 'numeric', month: 'short' }) + ' ' : day + '\'' + hour);
				})
			},
			{
				...axisDefaults(),
				scale: 'y',
				space: 48,
				values: (u, vals) => vals.map(v => v.toFixed(2)),
			}
		],
		scales: {
			x: {
				// time: false,
			},
			y: {
				// range: [-5, 365],
			}
		},
		series: [
			{ },
			{
				label: 'a10',
				stroke: color('cyan'),
			}
		]
	};
}

async function queryGSM(params: GSMParams) {
	const urlPara = new URLSearchParams({
		from: (params.interval[0].getTime() / 1000).toFixed(0),
		to:   (params.interval[1].getTime() / 1000).toFixed(0),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + 'api/gsm/?' + urlPara);
	if (res.status !== 200)
		return null;
	const body = await res.json() as { data: any[][], fields: string[] };
	if (!body?.data.length) return null;
	return body.fields.map((f, i) => body.data.map(row => row[i]));
}	

export default function PlotGSM(params: GSMParams) {
	const query = useQuery([params.interval], () => queryGSM(params));

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>NO DATA</div>;
	return (<div ref={node => setContainer(node)} style={{ position: 'absolute' }}>
		<UplotReact {...{ options: gsmPlotOptions(size, params), data: query.data as any }}/>
	</div>);
}