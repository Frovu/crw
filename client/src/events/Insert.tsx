import { useContext, type MouseEvent } from 'react';
import { MainTableContext, TableViewContext } from './events';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';
import CoverageControls from './CoverageControls';
import { useCursorTime, useEventsState, useTable } from './eventsState';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

export default function InsertControls() {
	const { data } = useTable();
	const { modifyId, setStartAt, setEndAt, plotId, cursor: sCursor,
		setStart, setEnd, setModify } = useEventsState();
	const { start, end, duration } = useCursorTime();

	const cursor = sCursor?.entity === 'feid' ? sCursor : null;
	const targetId = cursor?.id ?? plotId;
	const isMove = modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isLink = false;
	const isIdle = !isMove && !isInsert && !isLink;
	

	const escape = () => {
		setModify(null);
		setStart(null);
		setEnd(null);
	};

	const toggle = (what: 'insert' | 'modify') => (e?: MouseEvent) => {
		if (e) (e.target as HTMLButtonElement)?.blur();
		if (setStartAt || setEndAt || !start)
			return escape();
		if (what === 'modify')
			setModify(targetId);
		const at = what === 'insert' ? roundHour(start.getTime()) + 36e5 : start.getTime();
		setStart(new Date(at));
	};

	const handleEnter = () => {
		if (!end) return;
		if (setStartAt && setEndAt) {
			// insertEvent(setStartAt, setEndAt);
			console.log(setStartAt, setEndAt)
			
			return escape();
		}
		if (setStartAt) {
			const at = isInsert ? setStartAt.getTime() + 864e5 : end.getTime();
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
	if (!start)
		return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	return <div style={{ padding: 2, fontSize: 15, height: '100%', overflowY: 'scroll', textAlign: 'center'}}>
		<div style={{ display: 'flex' }}>
			{/* {(setStartAt || setEndAt) && <div>{isInsert ? 'New' : 'Move'} event at {prettyDate(setStartAt)}
				{setEndAt ? `, dur = ${((setEndAt.getTime()-setStartAt!.getTime())/36e5).toFixed(1)} h` : ''}</div>} */}
			<div style={{ display: 'flex', color: color('white'), gap: 2, paddingBottom: 2, alignSelf: 'end' }}>
				{(isIdle || isInsert) && <button onClick={isInsert ? handleEnter : toggle('insert')} style={{ width: 72 }}>Insert</button>}
				{(isIdle || isMove) && <button onClick={isMove ? handleEnter : toggle('modify')} style={{ width: 54 }}>Move</button>}
				{(isIdle || isLink) && <button onClick={isLink ? handleEnter : toggle('modify')} style={{ width: 54 }}>Link</button>}
				{!isIdle && <button style={{ width: isInsert ? 110 : 128 }} onClick={escape}>Cancel</button>}
			</div>
			<div style={{ alignSelf: 'start', position: 'relative' }}>
				<CoverageControls date={start}/>
			</div>
			
		</div>
		<table className='Table' style={{ overflow: 'none', borderCollapse: 'collapse' }}><tbody>		
			<tr>
				<td width={90}>MODE</td>
				<td width={180}>start time</td>
				<td width={48}>dur</td>
			</tr>
			<tr>
				<td style={{ color: color(isMove || isInsert ? 'magenta' : 'text') }}>
					{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : 'VIEW'}</td>
				<td>{prettyDate(start)}</td>
				<td>{duration}</td>
			</tr>
		</tbody></table>
	</div>;
}