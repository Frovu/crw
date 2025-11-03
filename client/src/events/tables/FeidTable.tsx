import { useContext, useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { color, openContextMenu } from '../../app';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { type Size, useEventListener } from '../../util';
import type { ColumnDef } from '../columns';
import { type TableParams, MainTableContext, TableViewContext, getChangelogEntry, type ChangeLogEntry, valueToString } from '../events';
import { useEventsState } from '../eventsState';
import { pickEventForSample } from '../sample';
import { TableWithCursor, CellInput, DefaultRow, DefaultCell } from './Table';

export default function FeidTableView({ size, averages, entity }: { size: Size; entity: string; averages?: (null | number[])[] }) {
	const { id: nodeId, params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { changelog: wholeChangelog, rels: relsNames } = useContext(MainTableContext);
	const { data, columns, markers, includeMarkers } = useContext(TableViewContext);
	const viewState = useEventsState();
	const { plotId, sort, cursor: sCursor, setStartAt, setEndAt, modifyId, changes, created, deleted, toggleSort, setPlotId } = viewState;
	const [changesHovered, setChangesHovered] = useState(false);
	const showChangelog = params?.showChangelog && size.height > 300;
	const showAverages = params?.showAverages && size.height > 300;
	const hideHeader = params?.hideHeader && size.height < 480;
	const cursor = sCursor?.entity === entity ? sCursor : null;

	const incMarkWidth =
		includeMarkers &&
		Math.min(
			16,
			Math.max.apply(
				null,
				includeMarkers.map((m) => m?.length)
			)
		);

	const cursCol = cursor && columns[cursor?.column]?.id;
	const changelogCols =
		(showChangelog || null) &&
		cursor &&
		wholeChangelog &&
		data[cursor.row] &&
		columns.map((c) => [c.id, getChangelogEntry(wholeChangelog, data[cursor.row][0], c.id)]);
	const changelog = changelogCols
		?.filter((c) => !!c[1])
		.flatMap(([col, chgs]) => (chgs as ChangeLogEntry).map((c) => ({ column: col, ...c })))
		.sort((a, b) => b.time - a.time)
		.sort((a, b) => (cursCol === b.column ? 1 : 0) - (cursCol === a.column ? 1 : 0));
	const changeCount = [changes, created, deleted].flatMap(Object.values).reduce((a, b) => a + b.length, 0);

	useEffect(() => {
		if (changeCount === 0) setChangesHovered(false);
	}, [changeCount]);

	const onKeydown = useCallback(
		(e: KeyboardEvent) => {
			if (cursor && ['-', '+', '='].includes(e.key))
				return pickEventForSample('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);
		},
		[cursor, data]
	);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (setStartAt || setEndAt || modifyId) return;
		if (cursor?.editing) return;

		if (cursor && ['-', '+', '='].includes(e.key))
			return pickEventForSample('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);
	});

	const simulateKey =
		(key: string, ctrl: boolean = false) =>
		() =>
			document.dispatchEvent(new KeyboardEvent('keydown', { code: key, ctrlKey: ctrl }));

	const rels = new Map<any, ColumnDef[]>();
	columns.forEach((col) => (rels.has(col.rel) ? rels.get(col.rel)?.push(col) : rels.set(col.rel, [col])));

	return (
		<TableWithCursor
			{...{
				data,
				columns,
				onKeydown,
				entity,
				allowEdit: true,
				size,
				headSize: (hideHeader ? 0 : 90) + (showAverages ? 98 : 0) + (!hideHeader && showChangelog ? 54 : 0),
				head: hideHeader
					? null
					: (cols, padH) => {
							const padTableH = Math.floor(padH / 3);
							const columnH = 38 + padH - padTableH;
							return (
								<>
									<tr style={{ fontSize: 15 }}>
										{markers && (
											<td
												rowSpan={2}
												title="f is for filter, + is whitelist, - is blacklist"
												className="ColumnHeader"
												style={{ minWidth: '3.5ch' }}
												onClick={() => toggleSort('_sample')}
											>
												##
												{sort.column === '_sample' && (
													<div className="SortShadow" style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }} />
												)}
											</td>
										)}
										{[...rels].map(([rel, cls]) => (
											<td className="ColumnHeader" key={rel} style={{ clipPath: 'none' }} colSpan={cls.length}>
												<div style={{ height: 22 + padTableH }}>{cls.length > 1 ? relsNames[rel] : rel}</div>
											</td>
										))}
										{includeMarkers && (
											<td
												rowSpan={2}
												title="Event included from samples:"
												className="ColumnHeader"
												style={{ minWidth: '3.5ch' }}
											>
												#S
											</td>
										)}
									</tr>
									<tr style={{ fontSize: 15 }}>
										{columns.map((col) => (
											<td
												key={col.id}
												title={`[${col.name}] ${col.description ?? ''}`}
												className="ColumnHeader"
												onClick={() => toggleSort(col.id)}
												onContextMenu={openContextMenu('events', { nodeId, header: col })}
											>
												<div style={{ height: columnH, lineHeight: 1 }}>
													<span>{col.name}</span>
													{sort.column === col.id && (
														<div
															className="SortShadow"
															style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}
														/>
													)}
												</div>
											</td>
										))}
									</tr>
								</>
							);
					  },
				row: (row, idx, onClick, padRow) => {
					const marker = markers?.[idx];
					const markerColor = marker && (marker.endsWith('+') ? 'cyan' : marker.endsWith('-') ? 'magenta' : 'text');
					const isCompModified = columns.map((c) => {
						if (!c.isComputed) return false;
						const chgs = getChangelogEntry(wholeChangelog, row[0], c.id)?.sort((a, b) => b.time - a.time);
						if (!chgs?.length) return false;
						return chgs[0].new !== 'auto' && chgs[0].special !== 'import';
					});

					const className = plotId === row[0] ? 'text-cyan' : 'text-text';

					return (
						<DefaultRow
							key={row[0]}
							{...{ row, idx, columns, cursor, className, padRow }}
							onClick={(e, cidx) => {
								if (setEndAt || setEndAt || modifyId) return;
								onClick(idx, cidx);
								if (e.ctrlKey) setPlotId(() => row[0]);
							}}
							contextMenuData={(cidx) => ({ nodeId, cell: { id: row[0], value: row[cidx + 1], column: columns[cidx] } })}
							title={(cidx) =>
								(cidx === 1 ? `id = ${row[0]}; ` : '') + `${columns[cidx].fullName} = ${valueToString(row[cidx + 1])}`
							}
							before={
								marker && (
									<td
										title="f: filtered; + whitelisted; - blacklisted"
										onClick={(e) => pickEventForSample(e.ctrlKey ? 'blacklist' : 'whitelist', row[0])}
									>
										<span className="Cell" style={{ color: color(markerColor!) }}>
											{marker}
										</span>
									</td>
								)
							}
							after={
								includeMarkers?.[idx] && (
									<td title="Included in these samples">
										<span style={{ width: incMarkWidth! + 2 + 'ch' }} className="Cell">
											{includeMarkers?.[idx]}
										</span>
									</td>
								)
							}
						>
							{({ column, cidx, curs }) => {
								const value = valueToString(row[cidx + 1]);

								return !curs?.editing ? (
									<DefaultCell column={column}>
										{value}
										{isCompModified?.[cidx] && <span className="ModifiedMarker" />}
									</DefaultCell>
								) : (
									<CellInput
										{...{
											table: entity as any,
											id: row[0],
											column,
											value,
										}}
									/>
								);
							}}
						</DefaultRow>
					);
				},
				tfoot: showAverages && (
					<>
						<tr style={{ height: 2 }}>
							<td colSpan={columns.length} style={{ height: 1, borderTop: 'none', borderColor: color('grid') }}></td>
						</tr>
						{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => (
							<tr key={label} style={{ height: 24, fontSize: 15 }}>
								{markers && <td style={{ borderColor: 'transparent' }} />}
								{averages?.map((avgs, i) => {
									const isLabel = columns[i].type === 'time';
									const val = avgs?.[ari];
									return (
										<td
											key={columns[i].id}
											style={{
												borderColor: color('grid'),
												textAlign: isLabel ? 'right' : 'unset',
												padding: isLabel ? '0 6px' : 0,
											}}
											onContextMenu={openContextMenu('events', {
												nodeId,
												averages: {
													averages,
													label,
													row: ari,
													column: i,
												},
											})}
											title={(!isLabel && val?.toString()) || ''}
										>
											{isLabel ? label : val ? val.toFixed?.(ari > 2 ? 3 : avgs[1] > 99 ? 1 : 2) : ''}
										</td>
									);
								})}
							</tr>
						))}
					</>
				),
				footer: hideHeader ? null : (
					<>
						{showChangelog && (
							<div
								style={{
									position: 'relative',
									display: 'flex',
									flexDirection: 'column-reverse',
									fontSize: 12,
									border: '1px var(--color-border) solid',
									height: 52,
									padding: 2,
									margin: 0,
									marginTop: 2,
									overflowY: 'scroll',
								}}
							>
								{changelog?.length ? (
									changelog.map((change) => {
										const column = columns.find((c) => c.id === change.column)!;
										const time = new Date(change.time * 1e3);
										const val = (str: string | null) =>
											str == null
												? 'null'
												: column.type === 'time'
												? new Date(parseInt(str) * 1e3).toISOString().replace(/\..*|T/g, ' ')
												: str;
										return (
											<div key={JSON.stringify(change)} style={{ margin: '0' }}>
												<i style={{ color: 'var(--color-text-dark)' }}>
													[
													{time
														.toISOString()
														.replace(/\..*|T/g, ' ')
														.slice(0, -4)}
													] @{change.author}{' '}
												</i>
												<i style={{ color: columns[cursor!.column].id === column.id ? color('active') : 'unset' }}>
													{' '}
													<b>{column.fullName}</b>
												</i>
												: {val(change.old)} -&gt; <b>{val(change.new)}</b>
												{change.special && <i style={{ color: 'var(--color-text-dark)' }}> ({change.special})</i>}
											</div>
										);
									})
								) : (
									<div className="Center" style={{ color: 'var(--color-text-dark)' }}>
										NO CHANGES
									</div>
								)}
							</div>
						)}
						<div
							style={{
								padding: '2px 0 2px 0',
								display: 'flex',
								justifyContent: 'space-between',
								alignContent: 'bottom',
							}}
						>
							<span
								style={{
									color: 'var(--color-text-dark)',
									fontSize: 14,
									overflow: 'clip',
									whiteSpace: 'nowrap',
									minWidth: 0,
								}}
							>
								<span style={{ color: color('active') }}> [{data.length}]</span>
								{changeCount > 0 && (
									<div
										style={{ display: 'inline-flex', width: 160, height: 19, justifyContent: 'center', gap: 12 }}
										onClick={(e) => e.stopPropagation()}
										onMouseEnter={() => setChangesHovered(true)}
										onMouseLeave={() => setChangesHovered(false)}
									>
										{!changesHovered && (
											<span style={{ color: color('red'), fontSize: 14 }}>
												&nbsp;&nbsp;With [{changeCount}] unsaved&nbsp;
											</span>
										)}
										{changesHovered && (
											<>
												<button
													className="TextButton"
													style={{ lineHeight: 1 }}
													onClick={simulateKey('KeyS', true)}
												>
													save
												</button>
												<button
													className="TextButton"
													style={{ lineHeight: 1 }}
													onClick={simulateKey('KeyX', true)}
												>
													discard
												</button>
											</>
										)}
									</div>
								)}
							</span>
							<span style={{ display: 'inline-flex', gap: '2px', fontSize: 16 }}>
								<button className="TableControl" onClick={simulateKey('ArrowUp')}>
									<span>↑</span>
								</button>
								<button className="TableControl" onClick={simulateKey('ArrowDown')}>
									<span>↓</span>
								</button>
								<button className="TableControl" onClick={simulateKey('Home', true)}>
									<span>H</span>
								</button>
								<button className="TableControl" onClick={simulateKey('End', true)}>
									<span>E</span>
								</button>
								<button className="TableControl" onClick={simulateKey('ArrowLeft')}>
									<span>←</span>
								</button>
								<button className="TableControl" onClick={simulateKey('ArrowRight')}>
									<span>→</span>
								</button>
							</span>
						</div>
					</>
				),
			}}
		/>
	);
}
