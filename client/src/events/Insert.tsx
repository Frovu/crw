import { type MouseEvent } from 'react';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';
import CoverageControls from './CoverageControls';
import { useCursor, useEventsState, useSources, useTable } from './eventsState';
import { flaresLinkId, otherLinkId, useTableQuery } from './sources';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

export default function InsertControls() {
	const { data } = useTable();
	const { modifyId, setStartAt, setEndAt, plotId, cursor: sCursor,
		setStart, setEnd, setModify, setModifySource } = useEventsState();
	const { start, end, duration, id: targetId } = useCursor();
	const sources = useSources();

	console.log(useEventsState.getState(), sources)

	const isLink = modifyId != null && setStartAt == null && setEndAt == null;
	const isMove = !isLink && modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isIdle = !isMove && !isInsert && !isLink;
	
	useTableQuery('feid_sources');
	useTableQuery('sources_erupt');
	useTableQuery('sources_ch');

	const escape = () => {
		setModify(null);
		setStart(null);
		setEnd(null);
	};

	const toggle = (what: 'insert' | 'move' | 'link') => (e?: MouseEvent) => {
		if (e) (e.target as HTMLButtonElement)?.blur();
		if (!isIdle || !start)
			return escape();
		if (what === 'move' || what === 'link')
			targetId && setModify(targetId);
		if (what === 'link') 
			return;
		const at = what === 'insert' ? roundHour(start.getTime()) + 36e5 : start.getTime();
		setStart(new Date(at));
	};

	const handleEnter = () => {
		if (!end) return;
		if (setStartAt && setEndAt) {
			// insertEvent(setStartAt, setEndAt);
			
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

	return <div style={{ padding: 2, fontSize: 15, height: '100%', overflowY: 'scroll', textAlign: 'center' }}>
		<div style={{ display: 'flex' }}>
			{/* {(setStartAt || setEndAt) && <div>{isInsert ? 'New' : 'Move'} event at {prettyDate(setStartAt)}
				{setEndAt ? `, dur = ${((setEndAt.getTime()-setStartAt!.getTime())/36e5).toFixed(1)} h` : ''}</div>} */}
			<div style={{ display: 'flex', color: color('white'), gap: 2, paddingBottom: 2, alignSelf: 'end' }}>
				{(isIdle || isInsert) && <button onClick={isInsert ? handleEnter : toggle('insert')} style={{ width: 72 }}>Insert</button>}
				{(isIdle || isMove) && <button onClick={isMove ? handleEnter : toggle('move')} style={{ width: 54 }}>Move</button>}
				{(isIdle || isLink) && <button onClick={isLink ? handleEnter : toggle('link')} style={{ width: 54 }}>Link</button>}
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
				<td style={{ color: color(!isIdle ? 'magenta' : 'text') }}>
					{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : isLink ? 'LINK' : 'VIEW'}</td>
				<td>{prettyDate(start)}</td>
				<td>{duration}</td>
			</tr>
		</tbody></table>
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, fontSize: 14 }}>
			{sources.filter(s => s.erupt).map((src, i) => {
				const clr = (what: 'FLR' | 'CME', which: string) => {
					const isSet = src.erupt?.[(what === 'FLR' ? flaresLinkId : otherLinkId as any)[which]];
					return { color: color(isSet ? 'green' : 'text-dark'), backgroundColor: isSet ? color('green', .2) : 'unset' };
				};
				return <div>
					<table className='Table' style={{ borderCollapse: 'collapse' }}><tbody>		
						<tr>
							<td width={84}>ERUPT #{i+1}</td>
							<td width={40} style={{ borderBottomColor: 'transparent', textAlign: 'right', color: color('text-dark') }}>FLR:</td>
							<td width={36} style={clr('FLR', 'SFT')}>SFT</td>
							<td width={36} style={clr('FLR', 'DKI')}>DKI</td>
							<td width={36} style={clr('FLR', 'NOA')}>NOA</td>
							<td width={36} style={clr('FLR', 'dMN')}>dMN</td>
							<td width={36} style={clr('CME', 'dMN')} rowSpan={2}>dMN DIM</td>
						</tr>
						<tr>
							<td height={10} style={{ color: color(src.source.influence == null ? 'red' : 'text') }}>Infl: {src.source.influence as any ?? 'N/A'}</td>

							<td style={{ textAlign: 'right', color: color('text-dark') }}>CME:</td>
							<td style={clr('CME', 'DKI')}>DKI</td>
							<td style={clr('CME', 'LASCO')} colSpan={2}>LASCO</td>
							<td style={clr('CME', 'R&C')}>R&C</td>
						</tr>
					</tbody></table>
				</div>;})}

		</div>
	</div>;
}