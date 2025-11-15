import { useContext, useState, useEffect, useCallback, type KeyboardEvent, useMemo } from 'react';
import { color } from '../../app';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { type Size } from '../../util';
import { useEntityCursor, useEventsState } from '../core/eventsState';
import { applySample, pickEventForSample } from '../sample/sample';
import { EventsTable, type SpecialColumn, type TableParams } from './Table';
import { useFeidSample, useFeidTableView } from '../core/feid';
import { useTablesStore, type TableRow } from '../core/editableTables';

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
	const { changes, created, deleted } = useTablesStore().feid;
	const { data, columns, markers } = useFeidTableView();
	const { sample, samples } = useFeidSample();
	const plotId = useEventsState((st) => st.plotId);
	const cursor = useEntityCursor('feid');

	const [changesHovered, setChangesHovered] = useState(false);

	// FIXME NOT ONLY FEID CHANGES
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
				footer: true ? null : (
					<>
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
