import { useContext, type MouseEvent } from 'react';
import { color, logSuccess, openContextMenu, useContextMenu } from '../app';
import { prettyDate, useEventListener } from '../util';
import CoverageControls from './CoverageControls';
import { useFeidCursor, useEventsState, useSources, useTable, makeChange, createFeid, deleteEvent, linkSource } from './eventsState';
import { getSourceLink, useTableQuery } from './sources';
import { ValidatedInput } from '../Utility';
import { LayoutContext, openWindow } from '../layout';
import type { FeidSrcRow } from './events';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

function Menu() {
	const { id: feidId } = useFeidCursor();
	const detail = useContextMenu((state) => state.menu?.detail) as { source: FeidSrcRow } | undefined;

	return (
		<>
			{detail?.source && (
				<div>
					<button className="TextButton" onClick={() => deleteEvent('feid_sources', detail.source.id)}>
						Delete source
					</button>
				</div>
			)}
			{feidId && (
				<div>
					<button
						className="TextButton"
						onClick={() => {
							const srcId = linkSource('sources_erupt', feidId);
							setTimeout(() => {
								const { setCursor, data } = useEventsState.getState();
								setCursor({ entity: 'sources_erupt', column: 2, row: data.sources_erupt!.findIndex((r) => r[0] === srcId), id: srcId });
							}, 100);
						}}
					>
						Add new eruption
					</button>
				</div>
			)}
			<div className="separator" />
			<button
				className="TextButton"
				onClick={(e) =>
					openWindow({
						x: e.clientX,
						y: e.clientY - 200,
						w: 200,
						h: 120,
						params: { type: 'SWPC Hint' } as any,
						unique: 'swpc-hint',
					})
				}
			>
				Open SWPC hint
			</button>
		</>
	);
}

function Panel() {
	const { modifyId, setStartAt, setEndAt, plotId, modifySource, setStart, setEnd, setModify, setModifySource, setPlotId } = useEventsState();
	const { start, end, duration, id: feidId, row: feid } = useFeidCursor();
	const { id: nodeId } = useContext(LayoutContext)!;
	const { columns } = useTable();
	const sources = useSources();

	const isLink = modifySource;
	const isMove = !isLink && modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isIdle = !isMove && !isInsert && !isLink;

	useTableQuery('feid_sources');
	useTableQuery('sources_erupt');
	useTableQuery('sources_ch');

	const srcs = useTable('feid_sources');

	const escape = () => {
		setModifySource(null);
		setModify(null);
		setStart(null);
		setEnd(null);
	};

	const toggle = (what: 'insert' | 'move' | 'link') => (e?: MouseEvent) => {
		if (e) (e.target as HTMLButtonElement)?.blur();
		if (!isIdle || !start) return escape();
		if (what === 'move' || what === 'link') feidId && setModify(feidId);
		if (what === 'link') return;
		const at = what === 'insert' ? roundHour(end?.getTime() ?? start.getTime()) : start.getTime();
		setStart(new Date(at));
	};

	const handleEnter = () => {
		if (!end || !columns || !feidId) return;
		if (setStartAt && setEndAt) {
			const dur = (setEndAt.getTime() - setStartAt.getTime()) / 36e5;
			if (isMove) {
				makeChange('feid', { column: 'time', id: feidId, value: setStartAt, fast: true });
				makeChange('feid', { column: 'duration', id: feidId, value: dur });
				logSuccess(`Moved FEID #${feidId} to ${prettyDate(setStartAt)}`);
			}
			if (isInsert) {
				const createdId = createFeid({ time: setStartAt, duration: dur });
				setPlotId(() => createdId);
			}
			return escape();
		}
		if (setStartAt) {
			const at = isInsert ? setStartAt.getTime() + 864e5 : end.getTime();
			return setEnd(new Date(at));
		}
	};

	const deleteFeid = () => {
		if (feidId) deleteEvent('feid', feidId);
	};

	useEventListener('escape', escape);

	useEventListener('plotClick', (e: CustomEvent<{ timestamp: number }>) => {
		const hour = new Date(roundHour(e.detail.timestamp * 1000));

		if (setEndAt) setEnd(hour);
		else if (setStartAt) setStart(hour);
	});

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code === 'Insert') return toggle('insert')();
		if (['Enter', 'NumpadEnter'].includes(e.code)) return handleEnter();
		if (!setStartAt && !setEndAt) return;
		const move = {
			ArrowRight: 36e5,
			ArrowLeft: -36e5,
		}[e.code];
		if (!move) return;
		const mul = e.ctrlKey ? 8 : 1;
		if (setEndAt) setEnd(new Date(roundHour(setEndAt.getTime()) + move * mul));
		else if (setStartAt) setStart(new Date(roundHour(setStartAt.getTime()) + move * mul));
	});

	useEventListener('action+cycleSource', () => {
		const modSrc = useEventsState.getState().modifySource;
		const idx = sources.findIndex((s) => s.source.id === modSrc);
		if (idx < 0) return setModifySource(sources.at(0)?.source.id || null);
		const nxt = sources[(idx + 1) % sources.length];
		setModifySource(nxt.source.id);
	});

	if (plotId == null || feidId == null || !start) return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	const errNoPrimary = !sources.find((s) => s.source.cr_influence === 'primary');

	const cycle = (which: 'onset_type' | 's_confidence', dir: -1 | 1) => {
		const column = columns.find((c) => c.id === which)!;
		const opts = column.enum!.concat(which === 'onset_type' ? ([null] as any) : []);
		const value = opts[(opts.length + opts.indexOf(feid[which] as any) + dir) % opts.length];
		makeChange('feid', { column: column.id, value, id: feidId, fast: true });
	};

	const cycleInfl = (src: (typeof sources)[number], dir: -1 | 1) => {
		const column = srcs.columns?.find((c) => c.id === 'cr_influence')!;
		const opts = column.enum!;
		const value = opts[(opts.length + opts.indexOf(src.source.cr_influence as any) + dir) % opts.length];
		makeChange('feid_sources', { column: column.id, value, id: src.source.id, fast: true });
	};
	const InflButton = ({ src }: { src: (typeof sources)[number] }) => {
		const infl = src.source.cr_influence;
		return (
			<td
				className="TextButton"
				height={10}
				width={84}
				style={{
					minWidth: 80,
					color: color({ primary: 'green', secondary: 'text', residual: 'text-dark', def: 'red' }[infl ?? 'def'] ?? 'red'),
					whiteSpace: 'nowrap',
				}}
				onContextMenu={(e) => {
					e.stopPropagation();
					e.preventDefault();
					cycleInfl(src, -1);
				}}
				onClick={(e) => {
					e.stopPropagation();
					cycleInfl(src, 1);
				}}
				onWheel={(e) => cycleInfl(src, e.deltaY > 0 ? 1 : -1)}
			>
				{infl ? infl : 'Infl: N/A'}
			</td>
		);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', padding: 1, fontSize: 15, height: '100%', overflowY: 'scroll', textAlign: 'center' }}>
			<div style={{ display: 'flex', flexWrap: 'wrap', padding: '1px 1px 0 0' }}>
				<div style={{ alignSelf: 'start', position: 'relative', width: 154, height: 26, paddingTop: 1 }}>
					<CoverageControls date={start} />
				</div>
				<div style={{ display: 'flex', flex: 1, maxWidth: 163, color: color('white'), gap: 2, paddingBottom: 2, alignSelf: 'end' }}>
					{(isIdle || isInsert) && (
						<button onClick={isInsert ? handleEnter : toggle('insert')} style={{ flex: 1 }}>
							Insert
						</button>
					)}
					{(isIdle || isMove) && (
						<button onClick={isMove ? handleEnter : toggle('move')} style={{ flex: 1 }}>
							Move
						</button>
					)}
					{!isIdle && (
						<button style={{ flex: 1 }} onClick={escape}>
							Cancel
						</button>
					)}
				</div>
			</div>
			<div style={{ padding: '0 1px' }}>
				<table className="Table" style={{ overflow: 'none', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
					<tbody>
						<tr style={{ height: 23 }}>
							<td width={64} style={{ color: color(!isIdle ? 'magenta' : 'text'), fontSize: 14 }}>
								{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : isLink ? 'LINK' : 'VIEW'}
							</td>
							<td title="Event onset time" colSpan={2} style={{ color: color('text-dark') }}>
								{prettyDate(start)}
							</td>
							<td title="Event duration in hours" width={48} style={{ color: color('text-dark') }}>
								+{duration}
							</td>
						</tr>
						<tr style={{ height: 23 }}>
							<td
								title="Event onset type"
								className="TextButton"
								style={{ color: color(feid.onset_type == null ? 'text-dark' : 'text') }}
								onContextMenu={(e) => {
									e.stopPropagation();
									e.preventDefault();
									cycle('onset_type', -1);
								}}
								onClick={(e) => {
									e.stopPropagation();
									cycle('onset_type', 1);
								}}
								onWheel={(e) => cycle('onset_type', e.deltaY > 0 ? 1 : -1)}
							>
								{feid.onset_type ? feid.onset_type : 'ons'}
							</td>
							<td title="Source type number" width={64} style={{ padding: '0 4px' }}>
								<span style={{ fontSize: 14, paddingRight: 4 }}>stype</span>
								<ValidatedInput
									type="text"
									value={feid.s_type}
									style={{ width: 36, padding: 0, background: color('input-bg', 0.5) }}
									callback={(value) => makeChange('feid', { id: feidId, column: 's_type', value, fast: true })}
								/>
								<span style={{ paddingLeft: 2, color: color('text-dark', 0.3) }}>(0)</span>
							</td>
							<td
								title="Source identification confidence"
								className="TextButton"
								colSpan={2}
								style={{ minWidth: 84 }}
								onContextMenu={(e) => {
									e.stopPropagation();
									e.preventDefault();
									cycle('s_confidence', -1);
								}}
								onClick={(e) => {
									e.stopPropagation();
									cycle('s_confidence', 1);
								}}
								onWheel={(e) => cycle('s_confidence', e.deltaY > 0 ? 1 : -1)}
							>
								<span style={{ fontSize: 14, paddingRight: 8 }}>conf</span>
								<span style={{ color: color({ low: 'orange', avg: 'text', high: 'green' }[feid.s_confidence ?? ''] ?? 'red') }}>
									{feid.s_confidence ? feid.s_confidence : 'N/A'}
								</span>
							</td>
						</tr>
						{(feid.flr_time || feid.cme_time) && (
							<tr style={{ fontSize: 12 }}>
								<td colSpan={4}>
									<div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
										{feid.flr_time && (
											<div
												style={{
													color: color(
														sources.find((s) => s.erupt?.flr_start?.getTime() === feid.flr_time?.getTime()) ? 'green' : 'red',
													),
												}}
											>
												flr {prettyDate(feid.flr_time).slice(5, 16)}
											</div>
										)}
										{feid.cme_time && (
											<div
												style={{
													color: color(
														sources.find((s) => s.erupt?.cme_time?.getTime() === feid.cme_time?.getTime()) ? 'green' : 'red',
													),
												}}
											>
												cme {prettyDate(feid.cme_time).slice(5, 16)}
											</div>
										)}
									</div>
								</td>
							</tr>
						)}
						<tr style={{ height: 23 }} title="Source description">
							<td colSpan={4}>
								<ValidatedInput
									type="text"
									value={feid.s_description}
									style={{ width: '100%', padding: 0, background: color('input-bg', 0.5) }}
									callback={(value) => makeChange('feid', { id: feidId, column: 's_description', value, fast: true })}
								/>
							</td>
						</tr>
						<tr style={{ height: 23 }} title="General notes">
							<td colSpan={4}>
								<ValidatedInput
									type="text"
									value={feid.comment}
									style={{ width: '100%', padding: 0, background: color('input-bg', 0.5) }}
									callback={(value) => makeChange('feid', { id: feidId, column: 'comment', value, fast: true })}
								/>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', paddingTop: 1, fontSize: 14 }}>
				{sources
					.filter((s) => s.erupt)
					.map((src, i) => {
						const srcId = src.source.id as number;
						const isActive = srcId === modifySource;

						const clr = (what: 'flare' | 'cme' | 'icme', which: string) => {
							const isSet = src.erupt?.[getSourceLink(what, which)[0]];
							return { color: color(isSet ? 'green' : 'text-dark'), backgroundColor: isSet ? color('green', 0.2) : 'unset' };
						};

						return (
							<div
								key={srcId}
								title={'id=' + src.source.id}
								onContextMenu={openContextMenu('events', { nodeId, ...src })}
								style={{ border: '1px solid ' + color(isActive ? 'active' : 'bg'), width: 'fit-content', cursor: 'pointer' }}
								onClick={() => setModifySource(isActive ? null : srcId)}
							>
								<table className="Table" style={{ borderCollapse: 'collapse' }}>
									<tbody>
										<tr>
											<td width={84} style={{ color: color('text-dark') }}>
												ERU{i + 1}
											</td>
											<td width={40} style={{ borderBottomColor: 'transparent', textAlign: 'right', color: color('text-dark') }}>
												FLR:
											</td>
											<td width={36} style={clr('flare', 'SFT')}>
												SFT
											</td>
											<td width={36} style={clr('flare', 'DKI')}>
												DKI
											</td>
											<td width={36} style={clr('flare', 'NOA')}>
												NOA
											</td>
											<td width={36} style={clr('flare', 'dMN')}>
												dMN
											</td>
										</tr>
										<tr>
											<InflButton src={src} />

											<td style={{ textAlign: 'right', color: color('text-dark') }}>CME:</td>
											<td style={clr('cme', 'DKI')}>DKI</td>
											<td style={clr('cme', 'LSC')} colSpan={2}>
												LASCO
											</td>
											<td style={clr('icme', 'R&C')}>R&C</td>
										</tr>
									</tbody>
								</table>
							</div>
						);
					})}
				{sources
					.filter((s) => s.ch)
					.map((src, i) => {
						const srcId = src.source.id;
						const isActive = srcId === modifySource;

						const clr = (which: 'solen' | 'chimera') => {
							const isSet = src.ch?.[which === 'solen' ? 'tag' : 'chimera_id'];
							return { color: color(isSet ? 'green' : 'text-dark'), backgroundColor: isSet ? color('green', 0.2) : 'unset' };
						};

						return (
							<div
								key={srcId}
								title={'id=' + src.source.id}
								onContextMenu={openContextMenu('events', { nodeId, ...src })}
								style={{ border: '1px solid ' + color(isActive ? 'active' : 'bg'), width: 'fit-content', cursor: 'pointer' }}
								onClick={() => setModifySource(isActive ? null : srcId)}
							>
								<table className="Table" style={{ borderCollapse: 'collapse' }}>
									<tbody>
										<tr>
											<td width={64} style={{ color: color('text-dark') }}>
												{(src.ch?.tag as string) ?? `CH#${i + 1}`}
											</td>
											<InflButton src={src} />
											<td width={60} style={clr('solen')}>
												SOLEN
											</td>
											<td width={60} style={clr('chimera')}>
												CHIMR
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						);
					})}
				<pre style={{ margin: 0, color: color('red') }}>{errNoPrimary && 'no primary source\n'}</pre>
			</div>
			<div style={{ flex: 1 }}></div>
			<div style={{ textAlign: 'right', padding: 1, color: color('white') }}>
				<button onClick={() => deleteFeid()}>Delete event</button>
			</div>
		</div>
	);
}

export const InsertControls = {
	name: 'Insert Controls',
	Menu,
	Panel,
};
