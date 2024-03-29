import { useContext } from 'react';
import { MainTableContext, useViewState } from './events';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';

export default function InsertControls() {
	const { data, columns } = useContext(MainTableContext);
	const { modifyId, insertAt, cursor, plotId, setInsert, setModify } = useViewState();

	const isModify = modifyId != null;
	const isInsert = insertAt != null;

	const doInsert = () => {
		if (isInsert)
			return setInsert(null);
		const idx = data.findIndex(r => r[0] === plotId);
		const timeIdx = columns.findIndex(cc => cc.id === 'fe_time');
		const plotDate = data[idx][timeIdx] as Date;
		setInsert(new Date(Math.round(plotDate.getTime() / 36e5) * 36e5 + 36e5));
	};

	const doModify = () => {

	};

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (!insertAt)
			return;
		const moveInsert = {
			'ArrowRight': 36e5,
			'ArrowLeft': -36e5
		}[e.code];
		if (!moveInsert)
			return;
		const mul = e.ctrlKey ? 8 : 1;
		setInsert(new Date(insertAt.getTime() + moveInsert * mul));
	});

	return <div style={{ padding: 8, display: 'flex', flexFlow: 'column', gap: 8 }}>
		<div>Mode: <span style={{ color: color(isModify || isInsert ? 'red' : 'text') }}>
			{isModify ? 'MODIFY' : isInsert ? 'INSERT' : 'VIEW'}</span></div>
		<div style={{ display: 'flex', gap: 4 }}>
			<button disabled={isModify || plotId == null} onClick={doInsert}>Insert</button>
			<button disabled={isInsert || !cursor} onClick={doModify}>Modify</button>
		</div>
		{insertAt && <div>Inserting at {prettyDate(insertAt)}</div>}
	</div>;
}