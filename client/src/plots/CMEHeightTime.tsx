import { useContext } from 'react';
import { useQuery } from 'react-query';
import { PlotContext } from '../events/events';
import { apiGet } from '../util';

export default function CMEHeightTime() {
	const { interval } = useContext(PlotContext)!;
	const [from, to] = interval.map(d => Math.floor(d.getTime() / 1e3));

	const query = useQuery(['CMEHT', from, to], () =>
		apiGet<{ time: number, speed: number, mpa: number, ht: [number, number][] }[]>('events/cme_heighttime', { from, to }));

	return <pre style={{ fontSize: 12 }}>
		{query.data?.map(d => `${d.time} : ${d.ht.length}`).join('\n')}
	</pre>;
}