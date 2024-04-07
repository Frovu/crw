import { useContext, type MouseEvent } from 'react';
import { MainTableContext, TableViewContext, useViewState } from './events';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';
import CoverageControls from './CoverageControls';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

export default function InsertControls() {
	const { data, columnIndex } = useContext(MainTableContext);
	const { data: viewData } = useContext(TableViewContext);
	const { modifyId, setStartAt, setEndAt, cursor, plotId, setStart, setEnd, setModify } = useViewState();

	const isMove = modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isLink = false;
	const isIdle = !isMove && !isInsert && !isLink;
	const [timeIdx, durIdx] = ['time', 'duration'].map(c => columnIndex[c]);
	const targetId = cursor && !cursor.entity ? viewData[cursor.row][0] : plotId;
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

	return <div style={{ padding: 2, fontSize: 15, height: '100%', overflowY: 'scroll', textAlign: 'center'}}>
		<div style={{ display: 'flex' }}>
			{/* {(setStartAt || setEndAt) && <div>{isInsert ? 'New' : 'Move'} event at {prettyDate(setStartAt)}
				{setEndAt ? `, dur = ${((setEndAt.getTime()-setStartAt!.getTime())/36e5).toFixed(1)} h` : ''}</div>} */}
			<div style={{ display: 'flex', color: color('white'), gap: 2, paddingBottom: 2, alignSelf: 'end' }}>
				{(isIdle || isInsert) && <button onClick={isInsert ? handleEnter : toggle('insert')} style={{ width: 72 }}>Insert</button>}
				{(isIdle || isMove) && <button onClick={isMove ? handleEnter : toggle('modify')} style={{ width: 56 }}>Move</button>}
				{(isIdle || isLink) && <button onClick={isLink ? handleEnter : toggle('modify')} style={{ width: 56 }}>Link</button>}
				{!isIdle && <button style={{ width: isInsert ? 112 : 128 }} onClick={escape}>Cancel</button>}
			</div>
			<div style={{ alignSelf: 'start', position: 'relative' }}>
				<CoverageControls date={startDate}/>
			</div>
			
		</div>
		<table className='Table' style={{ overflow: 'none', borderCollapse: 'collapse' }}>
			<tr>
				<td width={90}>MODE</td>
				<td width={180}>start time</td>
				<td width={48}>dur</td>
			</tr>
			<tr>
				<td style={{ color: color(isMove || isInsert ? 'magenta' : 'text') }}>
					{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : 'VIEW'}</td>
				<td>{prettyDate(startDate)}</td>
				<td>{data[targetIdx]?.[durIdx] as number}</td>
			</tr>
		</table>
	</div>;
}