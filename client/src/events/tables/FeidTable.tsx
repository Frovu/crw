import { useContext, useState, useEffect, useCallback, type KeyboardEvent, useMemo } from 'react';
import { color, openContextMenu } from '../../app';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { type Size, useEventListener } from '../../util';
import { valueToString } from '../core/util';
import { useEntityCursor, useEventsState } from '../core/eventsState';
import { applySample, pickEventForSample } from '../sample/sample';
import { EventsTable, type SpecialColumn, type TableParams } from './Table';
import type { ChangelogEntry, ChangelogResponse, Column, StaticColumn } from '../../api';
import { useFeidSample, useFeidTableView } from '../core/feid';
import { useTablesStore, type TableRow } from '../core/editableTables';
import { CellInput } from './TableInput';

const sampleMarkerCol: SpecialColumn = {
	type: 'special',
	sql_name: '_sample',
	dtype: 'text',
	width: 48,
	name: '##',
	description: 'f is for filter, + is whitelist, - is blacklist',
};
// onClick={(e) => }
// if (e.ctrlKey) setPlotId(() => row[0]);

const incMarkerCol: SpecialColumn = {
	type: 'special',
	sql_name: '_include',
	dtype: 'text',
	width: 48,
	name: '#S',
	description: 'event included from following samples',
};

export default function FeidTableView({ size, averages }: { size: Size; averages?: (null | number[])[] }) {
	const { params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { changelog: wholeChangelog, changes, created, deleted } = useTablesStore().feid;
	const { data, columns, markers } = useFeidTableView();
	const { plotId, sort, setStartAt, setEndAt, modifyId, setPlotId } = useEventsState();
	const { sample, samples } = useFeidSample();
	const cursor = useEntityCursor('feid');
	const [changesHovered, setChangesHovered] = useState(false);

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

	const withSampleMarkers = useMemo(() => {
		if (!markers) return { columns, data };
		return {
			data: data.map((row, i) => [row[0], markers[i], ...row.slice(1)]) as TableRow[],
			columns: [columns[0], sampleMarkerCol, ...columns.slice(1)],
		};
	}, [columns, markers, data]);

	const withIncludeMarkers = useMemo(() => {
		if (!params.showIncludeMarkers || !sample?.includes?.length || !samples) return withSampleMarkers;

		console.time('include markers');
		const smpls = sample.includes.map((sid) => samples.find((s) => s.id === sid));
		const set = {} as { [k: number]: string };
		for (const smpl of smpls) {
			if (!smpl) continue;
			const applied = applySample(data, smpl, columns, samples);
			for (let i = 0; i < applied.length; ++i) {
				set[applied[i][0]] = (set[applied[i][0]] ? set[applied[i][0]] + ';' : '') + smpl.name;
			}
		}
		console.timeEnd('include markers');
		return {
			data: withSampleMarkers.data.map((r) => [...r, set[r[0]]]),
			columns: [...withSampleMarkers.columns, incMarkerCol],
		};
	}, [params.showIncludeMarkers, sample?.includes, samples, withSampleMarkers, data, columns]);

	// const isCompModified =
	// 	wholeChangelog &&
	// 	columns.map((col) => {
	// 		if (col.type !== 'computed') return false;
	// 		const chgs = getChangelogEntry(wholeChangelog, row[0], col.sql_name)?.sort(
	// 			(a, b) => b.time - a.time
	// 		);
	// 		if (!chgs?.length) return false;
	// 		return chgs[0].new !== 'auto' && chgs[0].special !== 'import';
	// 	});

	return (
		<EventsTable
			{...{
				size,
				...withIncludeMarkers,
				onKeydown,
				entity: 'feid',
				enableEditing: true,
				rowClassName: (row) => (plotId === row[0] ? 'text-cyan' : undefined),
				onClick: (e, row, column) => {
					if (column.sql_name === '_sample') {
						pickEventForSample(e.ctrlKey ? 'blacklist' : 'whitelist', row[0] as number);
						return true;
					}
				},
				tfoot: null && (
					<>
						<tr style={{ height: 2 }}>
							<td
								colSpan={columns.length}
								style={{ height: 1, borderTop: 'none', borderColor: color('grid') }}
							></td>
						</tr>
						{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => (
							<tr key={label} style={{ height: 24, fontSize: 15 }}>
								{markers && <td style={{ borderColor: 'transparent' }} />}
								{averages?.map((avgs, i) => {
									const isLabel = columns[i].dtype === 'time';
									const val = avgs?.[ari];
									return (
										<td
											key={columns[i].sql_name}
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
				footer: true ? null : (
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
										const column = columns.find((c) => c.sql_name === change.column)!;
										const time = new Date(change.time * 1e3);
										const val = (str: string | null) =>
											str == null
												? 'null'
												: column.dtype === 'time'
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
												<i
													style={{
														color:
															columns[cursor!.column].sql_name === column.sql_name
																? color('active')
																: 'unset',
													}}
												>
													{' '}
													<b>{column.name}</b>
												</i>
												: {val(change.old)} -&gt; <b>{val(change.new)}</b>
												{change.special && (
													<i style={{ color: 'var(--color-text-dark)' }}> ({change.special})</i>
												)}
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
										style={{
											display: 'inline-flex',
											width: 160,
											height: 19,
											justifyContent: 'center',
											gap: 12,
										}}
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
