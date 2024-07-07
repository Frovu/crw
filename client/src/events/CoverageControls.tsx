import { useState, useEffect, useMemo } from 'react';
import { useQueryClient, useMutation, useQuery } from 'react-query';
import { logSuccess, logError, color } from '../app';
import { type OpState, apiPost, useEventListener, apiGet, dispatchCustomEvent } from '../util';

const ENTS = {
	lasco_cmes: ['LASCO CME', false],
	donki_cmes: ['DONKI CME', false],
	donki_flares: ['DONKI FLR', false],
	solarsoft_flares: ['SSOFT FLR', false],
	solardemon_flares: ['DEMON FLR', true],
	// solardemon_dimmings: ['DEMON DIM', true],
	r_c_icmes: ['R&C ICME', true],
} as const;

const ORANGE_THRESHOLD = 30;

function CoverageEntry({ entity, entShort, isSingle, d1, d2, date }:
{ entity: string, entShort: string, isSingle: boolean, d1: number|null, d2: number|null, date: Date }) {
	const [hovered, setHovered] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);

	useEffect(() => {
		if (!hovered) return;
		const timeout = setTimeout(() => setHovered(false), 2000);
		return () => clearTimeout(timeout);
	}, [hovered]);

	const queryClient = useQueryClient();
	const { mutate, reset, data, isIdle, error: mutError } = useMutation<OpState, Error, void, unknown>(() =>
		apiPost<OpState>('events/fetch_source', { entity, timestamp: date.getTime() / 1e3 }),
	{
		onSuccess: (state) => {
			setHovered(false);
			if (state.status === 'working') {
				setProgress(state.progress);
				setTimeout(() => mutate(), 500);
			} else {
				if (state.status === 'done') {
					queryClient.refetchQueries('events_coverage');
					queryClient.refetchQueries(entity);
					if (entity.includes('flares'))
						queryClient.refetchQueries('flares');
					if (entity.includes('cme'))
						queryClient.refetchQueries('CMEs');
					logSuccess('Updated ' + entShort);
				} else {
					logError('Failed to update: ' + state.error);
				}
				setProgress(null);
				setTimeout(() => reset(), state.status === 'done' ? 3000 : 30000);
			}
		},
		onError: (err) => {
			setHovered(false);
			setProgress(null);
			logError('Failed to update: ' + err.toString());
		}
	});
	const isWorking = data?.status === 'working' || progress != null;
	const isDone = data?.status === 'done';
	const error = data?.status === 'error' ? data.error : mutError?.toString();

	useEventListener('fetchAllSources', () => !isWorking && entity !== 'solardemon_flares' && mutate());

	const border = { border: '1px solid ' + color('border') };
	const style = (d: number | null) => {
		const col = d == null ? 'red' : d >= ORANGE_THRESHOLD ? 'orange' : 'green';
		return { ...border, width: 56, backgroundColor: color(col, .2), color: color(col) };
	};

	return <tr style={{ cursor: 'pointer' }} onClick={() => mutate()}
		onMouseOut={() => setHovered(false)} onMouseOver={() => setHovered(true)}>
		<td style={{ textAlign: 'right', paddingRight: 6 }}>{entShort}</td>
		{!isWorking && hovered && <td colSpan={2} style={{ ...border, color: color('active') }}>update</td>}
		{(isWorking || (!isIdle && !hovered)) && <td colSpan={2} style={{ ...border, color: color(error ? 'red' : isDone ? 'green' : 'active') }}>
			{isWorking && `${(((data?.status === 'working' && data.progress) || progress || 0) * 100).toFixed()} %`}
			{isDone && 'updated!'}
			{error && 'ERROR'}
		</td>}
		{isIdle && !hovered && <><td style={style(d1)}>
			{d1 == null ? 'N/A' : `T-${d1.toFixed()}d`}</td>
		{<td style={style(d2)}>
			{d2 == null ? 'N/A' : `T-${d2.toFixed()}d`}</td>}</>}
	</tr>;
}

export default function CoverageControls({ date }: { date: Date }) {
	const [minified, setMinified] = useState(true);
	const [hovered, setHovered] = useState(false);

	useEffect(() => {
		if (!hovered) return;
		const timeout = setTimeout(() => setHovered(false), 2000);
		return () => clearTimeout(timeout);
	}, [hovered]);

	useEventListener('escape', () => setMinified(true));

	const coverageQuery = useQuery(['events_coverage'],
		() => apiGet<{ [ent: string]: string[][] }>('events/coverage'));

	const [data, month1, month2] = useMemo(() => {
		const m1 = new Date(Date.UTC(date.getFullYear(), date.getMonth() - 1, 1));
		const m2 = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
		if (!coverageQuery.data)
			return [null, m1, m2];

		return [Object.entries(ENTS).map(([entity, [entShort, isSingle]]) => {
			const coverage = coverageQuery.data[entity];
			if (coverage.length < 1)
				return { entity, entShort, isSingle, d1: null, d2: null };
			
			const [d1, d2] = (() => {
				if (isSingle) {
					const cov = coverage[0];
					const diff = (Date.now() - new Date(cov[2]).getTime()) / 864e5;
					return [m1, m2].map(m => new Date(cov[0]) < m && m < new Date(cov[1]) ? diff : null);
				}

				return [m1, m2].map(m => {
					const cov = coverage.find(c => new Date(c[0]).getTime() === m.getTime());
					if (!cov)
						return null;
					return (Date.now() - new Date(cov[2]).getTime()) / 864e5;
				});
			})();

			return { entity, entShort, isSingle, d1, d2 };
		}), m1, m2];
	}, [coverageQuery.data, date]);

	if (!data) return <div>coverage...</div>;

	const gaps = minified && data.find(({ d1, d2 }) => d1 == null || d2 == null);
	const oldest = !minified ? 0 : Math.max.apply(null, data.flatMap(({ d1, d2 }) => [d1!, d2!]));
	const colour = gaps ? 'red' : oldest && oldest >= ORANGE_THRESHOLD ? 'orange' : 'green';

	return <div style={{ position: 'absolute', padding: '1px 3px 3px 3px', background: color('bg'), zIndex: 2,
		border: !minified ? '1px solid'+color('border') : 'none' }}>
		<table style={{ textAlign: 'center', width: 'max-content', fontSize: 14, borderCollapse: 'collapse' }}><tbody>
			<tr style={{ cursor: 'pointer', lineHeight: minified ? 1.1 : 1.5 }}
				onMouseOut={() => setHovered(false)} onMouseOver={() => setHovered(true)}>
				<td style={{ color: color(colour === 'red' ? 'red' : 'text-dark'), paddingBottom: 4, width: 84 }} className='TextButton'
					onClick={() => setMinified(minified ? false : true)}>{hovered ? (minified ? 'expand' : 'hide') : 'coverage'}</td>
				{minified && <td style={{
					width: 62, border: '1px solid '+color('border'),
					color: color(colour), backgroundColor: color(colour, .2) }}>T-{oldest.toFixed()}d</td>}
				{!minified && hovered && <td colSpan={2} style={{ width: 112 }} className='TextButton'
					onClick={() => dispatchCustomEvent('fetchAllSources')}>update all</td>}
				{!minified && !hovered && <>
					<td>{month1.toLocaleString('default', { month: 'short' })}</td>
					<td><b>{month2.toLocaleString('default', { month: 'short' })}</b></td></>}</tr>
			{!minified && data?.map(ent => <CoverageEntry key={ent.entity} date={month2} {...ent}/>)}
		</tbody></table>
	</div>;
}
