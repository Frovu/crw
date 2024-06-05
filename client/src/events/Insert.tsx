import { type MouseEvent } from 'react';
import { color } from '../app';
import { prettyDate, useEventListener } from '../util';
import CoverageControls from './CoverageControls';
import { useFeidCursor, useEventsState, useSources, useTable, makeChange } from './eventsState';
import { getSourceLink, useTableQuery } from './sources';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

export default function InsertControls() {
	const { modifyId, setStartAt, setEndAt, plotId, modifySource,
		setStart, setEnd, setModify, setModifySource } = useEventsState();
	const { start, end, duration, id: targetId } = useFeidCursor();
	const sources = useSources();

	const isLink = modifySource;
	const isMove = !isLink && modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isIdle = !isMove && !isInsert && !isLink;
	
	useTableQuery('feid_sources');
	useTableQuery('sources_erupt');
	useTableQuery('sources_ch');

	const srcs = useTable('feid_sources');
	const inflColumn = srcs.columns?.find(c => c.id === 'cr_influence');
	const inflOpts = inflColumn?.enum;

	const escape = () => {
		setModifySource(null);
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

	useEventListener('action+cycleSource', () => {
		const modSrc = useEventsState.getState().modifySource;
		const idx = sources.findIndex(s => s.source.id === modSrc);
		if (idx < 0)
			return setModifySource(sources.at(0)?.source.id as number || null);
		const nxt = sources[(idx + 1) % sources.length];
		setModifySource(nxt.source.id as number);
	});

	useEventListener('action+autoSource', () => {
		
	});

	if (plotId == null)
		return null;
	if (!start)
		return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	return inflOpts && <div style={{ padding: 1, fontSize: 15, height: '100%', overflowY: 'scroll', textAlign: 'center' }}>
		<div style={{ display: 'flex', padding: '1px 1px 0 0' }}>
			<div style={{ alignSelf: 'start', position: 'relative', width: 154, paddingTop: 1 }}>
				<CoverageControls date={start}/>
			</div>
			<div style={{ display: 'flex', flex: 1, maxWidth: 163, color: color('white'), gap: 2, paddingBottom: 2, alignSelf: 'end' }}>
				{(isIdle || isInsert) && <button onClick={isInsert ? handleEnter : toggle('insert')} style={{ flex: 1 }}>Insert</button>}
				{(isIdle || isMove) && <button onClick={isMove ? handleEnter : toggle('move')} style={{ flex: 1 }}>Move</button>}
				{!isIdle && <button style={{ flex: 1 }} onClick={escape}>Cancel</button>}
			</div>
			
		</div>
		<div style={{ paddingBottom: 2 }}>
		</div>
		<div style={{ padding: '0 1px' }}>
			<table className='Table' style={{ overflow: 'none', borderCollapse: 'collapse' }}><tbody>		
				<tr>
					<td width={90}>MODE</td>
					<td width={178}>start time</td>
					<td width={48}>dur</td>
				</tr>
				<tr>
					<td style={{ color: color(!isIdle ? 'magenta' : 'text') }}>
						{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : isLink ? 'LINK' : 'VIEW'}</td>
					<td>{prettyDate(start)}</td>
					<td>{duration}</td>
				</tr>
			</tbody></table>
		</div>
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 1, fontSize: 14 }}>
			{sources.filter(s => s.erupt).map((src, i) => {
				const infl = src.source.cr_influence as string | null;
				const srcId = src.source.id as number;
				const isActive = srcId === modifySource;
			
				const clr = (what: 'flare' | 'cme' | 'icme', which: string) => {
					const isSet = src.erupt?.[getSourceLink(what, which)[0]];
					return { color: color(isSet ? 'green' : 'text-dark'), backgroundColor: isSet ? color('green', .2) : 'unset' };
				};

				const cycleInfl = (dir: -1 | 1) => {
					const value = inflOpts[(inflOpts.length + inflOpts.indexOf(infl as any) + dir) % inflOpts.length];
					makeChange('feid_sources', { column: inflColumn, value, id: srcId });
				};
				return <div key={srcId}
					style={{ border: '1px solid '+color(isActive ? 'active' : 'bg'), width: 'fit-content', cursor: 'pointer' }}
					onClick={() => setModifySource(isActive ? null : srcId)}>
					<table className='Table' style={{ borderCollapse: 'collapse' }}><tbody>		
						<tr>
							<td width={84} style={{ color: color('text-dark') }}>
								ERU{i+1}</td>
							<td width={40} style={{ borderBottomColor: 'transparent', textAlign: 'right', color: color('text-dark') }}>FLR:</td>
							<td width={36} style={clr('flare', 'SFT')}>SFT</td>
							<td width={36} style={clr('flare', 'DKI')}>DKI</td>
							<td width={36} style={clr('flare', 'NOA')}>NOA</td>
							<td width={36} style={clr('flare', 'dMN')}>dMN</td>
						</tr>
						<tr>
							<td className='TextButton' height={10}
								style={{ color:color({ primary: 'cyan', secondary: 'text', residual: 'text-dark', def: 'red' }[infl ?? 'def'] ??  'red') }}
								onContextMenu={e => {e.stopPropagation(); e.preventDefault(); cycleInfl(-1); }}
								onClick={e => { e.stopPropagation(); cycleInfl(1); }}
								onWheel={e => cycleInfl(e.deltaY > 0 ? 1 : -1)}>
								
								{infl ? infl : 'Infl: N/A'}</td>
							<td style={{ textAlign: 'right', color: color('text-dark') }}>CME:</td>
							<td style={clr('cme', 'DKI')}>DKI</td>
							<td style={clr('cme', 'LSC')} colSpan={2}>LASCO</td>
							<td style={clr('icme', 'R&C')}>R&C</td>
						</tr>
					</tbody></table>
				</div>;})}

		</div>
	</div>;
}