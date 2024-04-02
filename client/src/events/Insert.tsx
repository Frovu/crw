import { useContext, type MouseEvent } from 'react';
import { MainTableContext, TableViewContext, useViewState } from './events';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

export default function InsertControls() {
	const { data, columns } = useContext(MainTableContext);
	const { data: viewData, columns: viewColumns } = useContext(TableViewContext);
	const { modifyId, setStartAt, setEndAt, cursor, plotId, setStart, setEnd, setModify } = useViewState();

	const isModify = modifyId != null;
	const isInsert = !isModify && (setStartAt != null || setEndAt != null);
	const [timeIdx, durIdx] = ['fe_time', 'fe_duration'].map(c => columns.findIndex(cc => cc.id === c));
	const targetId = cursor ? viewData[cursor.row][0] : plotId;
	const targetIdx = data.findIndex(r => r[0] === targetId);
	const startDate = data[targetIdx][timeIdx] as Date;
	const endDate = new Date(startDate.getTime() + (data[targetIdx][durIdx] as number) * 36e5) ;

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

	if (targetIdx < 0)
		return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	return <div style={{ padding: 8, display: 'flex', flexFlow: 'column', gap: 8 }}>
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