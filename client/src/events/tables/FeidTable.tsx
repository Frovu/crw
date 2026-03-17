import { useContext, useMemo } from 'react';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { type Size } from '../../util';
import { useEventsState } from '../core/eventsState';
import { applySample, pickEventForSample } from '../sample/sample';
import { EventsTable, type SpecialColumn, type TableColumn, type TableParams } from './Table';
import { useFeidSample, useFeidTableView } from '../core/feid';
import { getChangelogEntry, type TableRow } from '../core/editableTables';
import { ChangesGadget } from '../core/changes';
import { valueToString } from '../core/util';

const sampleMarkerCol: SpecialColumn = {
	type: 'special',
	sql_name: '_sample',
	dtype: 'text',
	width: 48,
	name: '##',
	description: 'f is for filter, + is whitelist, - is blacklist',
};

const incMarkerCol: SpecialColumn = {
	type: 'special',
	sql_name: '_include',
	dtype: 'text',
	width: 48,
	name: '#S',
	description: 'event included from following samples',
};

export default function FeidTableView({ size }: { size: Size }) {
	const { params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { data, columns, markers } = useFeidTableView();
	const { sample, samples } = useFeidSample();
	const plotId = useEventsState((st) => st.plotId);

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

	const isCompModified = (id: number, col: TableColumn) => {
		if (col.type !== 'computed') return false;
		const chgs = getChangelogEntry('feid', id, col.sql_name)?.sort((a, b) => b.time - a.time);
		if (!chgs?.length) return false;
		return chgs[0].new !== 'auto' && chgs[0].special !== 'import';
	};

	return (
		<>
			<EventsTable
				{...{
					size: {
						...size,
						height: size.height - 22,
					},
					...withIncludeMarkers,
					entity: 'feid',
					enableEditing: true,
					rowClassName: (row) => (plotId === row[0] ? 'text-cyan' : undefined),
					cellContent: (val, col, row) => (
						<>
							{valueToString(val)}
							{isCompModified(row[0] as number, col) && <span className="mark-modified" />}
						</>
					),
					onKeydown: (e, cursor) => {
						if (cursor && ['-', '+', '='].includes(e.key))
							return pickEventForSample('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);
					},
					onClick: (e, row, column) => {
						if (column.sql_name === '_sample') {
							pickEventForSample(e.ctrlKey ? 'blacklist' : 'whitelist', row[0] as number);
							return true;
						}
					},
				}}
			/>
			<div className="flex justify-between content-bottom h-[22px]">
				<div className="flex text-dark text-sm overflow-clip whitespace-nowrap">
					<div className="text-active"> [{data.length}]</div>
					<ChangesGadget />
				</div>

				<div className="flex gap-[2px] text-base text-dark font-bold">
					{[
						['↑', 'ArrowUp'],
						['↓', 'ArrowDown'],
						['H', 'Home'],
						['E', 'End'],
						['←', 'ArrowLeft'],
						['→', 'ArrowRight'],
					].map(([label, key]) => (
						<button
							key={key}
							className="hover:text-active border-1 w-5 h-5 leading-none"
							onClick={simulateKey(key, ['Home', 'End'].includes(key))}
						>
							{label}
						</button>
					))}
				</div>
			</div>
		</>
	);
}
