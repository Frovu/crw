import { useContext, type MouseEvent, useMemo, useState, useEffect } from 'react';
import { MainTableContext, TableViewContext, useViewState } from './events';
import { color, logError, logSuccess } from '../app';
import { apiGet, apiPost, prettyDate, useEventListener, type OpState, dispatchCustomEvent } from '../util';
import { useMutation, useQuery, useQueryClient } from 'react-query';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

const ENTS = {
	lasco_cmes: ['LASCO CME', false],
	donki_cmes: ['DONKI CME', false],
	donki_flares: ['DONKI FLR', false],
	solarsoft_flares: ['SSOFT FLR', false],
	solardemon_flares: ['DEMON FLR', true],
	solardemon_dimmings: ['DEMON DIM', true],
	r_c_icmes: ['R&C ICME', true],
} as const;

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
					queryClient.invalidateQueries('events_coverage');
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

	useEventListener('fetchAllSources', () => !isWorking && mutate());

	const border = { border: '1px solid ' + color('border') };
	const style = (d: number | null) => {
		const col = d == null ? 'red' : d >= 30 ? 'orange' : 'green';
		return { ...border, width: 56, backgroundColor: color(col, .2), color: color(col) };
	}

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

function CoverageControls({ date }: { date: Date }) {
	const [hovered, setHovered] = useState(false);
	useEffect(() => {
		if (!hovered) return;
		const timeout = setTimeout(() => setHovered(false), 2000);
		return () => clearTimeout(timeout);
	}, [hovered]);

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

	return <div style={{ textAlign: 'center', fontSize: 14 }}>
		<table style={{ borderCollapse: 'collapse' }}>
			<tr style={{ cursor: 'pointer' }} onClick={() => dispatchCustomEvent('fetchAllSources')}
				onMouseOut={() => setHovered(false)} onMouseOver={() => setHovered(true)}>
				<td style={{ color: color('text-dark'), paddingBottom: 4 }}>coverage</td>
				{hovered && <td colSpan={2} style={{ color: color('active'), width: 112 }}>update all</td>}
				{!hovered && <>
					<td>{month1.toLocaleString('default', { month: 'short' })}</td>
					<td><b>{month2.toLocaleString('default', { month: 'short' })}</b></td></>}</tr>
			{data?.map(ent => <CoverageEntry key={ent.entity} date={month2} {...ent}/>)}
		</table>
	</div>;
}

export default function InsertControls() {
	const { data, columns } = useContext(MainTableContext);
	const { data: viewData } = useContext(TableViewContext);
	const { modifyId, setStartAt, setEndAt, cursor, plotId, setStart, setEnd, setModify } = useViewState();

	const isModify = modifyId != null;
	const isInsert = !isModify && (setStartAt != null || setEndAt != null);
	const [timeIdx, durIdx] = ['fe_time', 'fe_duration'].map(c => columns.findIndex(cc => cc.id === c));
	const targetId = cursor ? viewData[cursor.row][0] : plotId;
	const targetIdx = data.findIndex(r => r[0] === targetId);
	const startDate = data[targetIdx]?.[timeIdx] as Date;
	const endDate = new Date(startDate?.getTime() + (data[targetIdx]?.[durIdx] as number) * 36e5);

	const escape = () => {
		setModify(null);
		setStart(null);
		setEnd(null);
	};

	const toggle = (what: 'insert' | 'modify') => (e?: MouseEvent) => {
		if (e) (e.target as HTMLButtonElement)?.blur();
		if (setStartAt || setEndAt)
			return escape();
		if (what === 'modify')
			setModify(targetId);
		const at = what === 'insert' ? roundHour(startDate.getTime()) + 36e5 : startDate.getTime();
		setStart(new Date(at));
	};

	const handleEnter = () => {
		if (setStartAt && setEndAt) {
			// insertEvent(setStartAt, setEndAt);
			console.log(setStartAt, setEndAt)
			
			return escape();
		}
		if (setStartAt) {
			const at = isInsert ? setStartAt.getTime() + 864e5 : endDate.getTime();
			return setEnd(new Date(at));
		}
	};

	useEventListener('escape', escape);

	useEventListener('plotClick', (e: CustomEvent<{ timestamp: number }>) => {
		const hour = new Date(roundHour(e.detail.timestamp * 1000));

		if (setEndAt)
			setEnd(hour);
		else if (setStartAt)
			setStart(hour);
	});

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code === 'Insert')
			return toggle('insert')();
		if (['Enter', 'NumpadEnter'].includes(e.code))
			return handleEnter();
		if (!setStartAt && !setEndAt)
			return;
		const move = {
			'ArrowRight': 36e5,
			'ArrowLeft': -36e5
		}[e.code];
		if (!move)
			return;
		const mul = e.ctrlKey ? 8 : 1;
		if (setEndAt)
			setEnd(new Date(roundHour(setEndAt.getTime()) + move * mul));
		else if (setStartAt)
			setStart(new Date(roundHour(setStartAt.getTime()) + move * mul));
	});

	if (plotId == null)
		return null;
	if (targetIdx < 0)
		return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	return <div style={{ padding: 8, display: 'flex', flexFlow: 'column', gap: 8, height: '100%', overflowY: 'scroll' }}>
		{<CoverageControls date={startDate}/>}
		<div>Mode: <span style={{ color: color(isModify || isInsert ? 'red' : 'text') }}>
			{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isModify ? 'MOVE' : 'VIEW'}</span></div>
		<div style={{ display: 'flex', gap: 4 }}>
			<button disabled={isModify || plotId == null} onClick={isInsert ? handleEnter : toggle('insert')}>Insert</button>
			<button disabled={isInsert} onClick={isModify ? handleEnter : toggle('modify')}>Modify</button>
			{(setStartAt || setEndAt) && <button onClick={escape}>Cancel</button>}
		</div>
		{(setStartAt || setEndAt) && <div>{isInsert ? 'New' : 'Move'} event at {prettyDate(setStartAt)}
			{setEndAt ? `, dur = ${((setEndAt.getTime()-setStartAt!.getTime())/36e5).toFixed(1)} h` : ''}</div>}
	</div>;
}