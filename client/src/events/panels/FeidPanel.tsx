import { useContext, useEffect, useMemo, useRef } from 'react';
import { AuthContext, openContextMenu, useEventsContextMenu } from '../../app';
import { useLayout, LayoutContext, type ContextMenuProps, type LayoutContextType, AppLayoutContext } from '../../layout';
import { clamp, dispatchCustomEvent, useEventListener, useSize } from '../../util';
import {
	useEventsSettings,
	copyAverages,
	valueToString,
	setStatColumn,
	type EventsSettings,
	type EventsPanel,
} from '../core/util';
import { useSampleState, defaultFilterOp } from '../sample/sample';
import ColumnsSelector from '../columns/Columns';
import ImportMenu from '../export/Import';
import SampleView from '../sample/Sample';
import { useQueryClient } from '@tanstack/react-query';
import { useEventsState } from '../core/eventsState';
import FeidTableView from '../tables/FeidTable';
import { useTable } from '../core/editableTables';
import { useFeidSample, useFeidTableView } from '../core/feid';
import { useTableDataQuery } from '../core/query';
import { type TableParams } from '../tables/Table';

const defaultTableParams: TableParams = {
	showChangelog: false,
	showAverages: true,
	showIncludeMarkers: true,
};

export function EventsCheckbox({ text, k }: { text: string; k: keyof EventsSettings }) {
	const settings = useEventsSettings.getState();
	return (
		<label>
			{text}
			<input
				type="checkbox"
				style={{ paddingLeft: 4 }}
				checked={settings[k] as boolean}
				onChange={(e) => settings.set(k, e.target.checked)}
			/>
		</label>
	);
}

function Menu({ params, Checkbox }: ContextMenuProps<TableParams>) {
	const queryClient = useQueryClient();
	const { role } = useContext(AuthContext);
	const menu = useEventsContextMenu<'feid'>();
	const { toggleSort, setPlotId } = useEventsState();
	const panels = Object.values(useContext(AppLayoutContext).panels) as EventsPanel<unknown>[];
	const layout = useLayout();
	const { addFilter } = useSampleState();

	console.log('123123', menu);

	const statsPresent = Object.values(layout.items).some((node) => panels.find((p) => p.name === node?.type)?.isStat);
	const column = menu.column;
	const value = menu.event?.[column.sql_name as keyof typeof menu.event];
	const feidId = menu.event?.id;
	const averages = menu.averages;

	return (
		<>
			{averages && (
				<>
					<button onClick={() => copyAverages(averages, 'row')}>Copy {averages?.label}</button>
					<button onClick={() => copyAverages(averages, 'col')}>Copy column averages</button>
					<button onClick={() => copyAverages(averages, 'all')}>Copy all averages</button>
					<div className="separator" />
				</>
			)}
			<button onClick={() => dispatchCustomEvent('action+openColumnsSelector')}>Select columns</button>
			<div className="separator" />
			{feidId != null && (
				<>
					<button onClick={() => setPlotId(() => feidId)}>Plot this event</button>
					<div className="separator" />
				</>
			)}
			{feidId == null && <button onClick={() => queryClient.refetchQueries()}>Reload table</button>}
			{feidId == null && <button onClick={openContextMenu('tableExport', undefined, true)}>Export table</button>}
			{!column && role && (
				<>
					<button onClick={() => dispatchCustomEvent('action+openImportMenu')}>Import table</button>
					<button onClick={() => dispatchCustomEvent('computeAll')}>Recompute everything</button>
				</>
			)}
			{column && (
				<>
					{role && feidId != null && (
						<button onClick={() => dispatchCustomEvent('computeRow', { id: feidId })}>Recompute row</button>
					)}
					{(column.name === 'duration' || column.type === 'computed') && role && (
						<button onClick={() => dispatchCustomEvent('computeColumn', { column })}>Recompute column</button>
					)}
					<button onClick={() => toggleSort(column.sql_name, 1)}>Sort ascending</button>
					<button onClick={() => toggleSort(column.sql_name, -1)}>Sort descening</button>
					{column.type !== 'special' && statsPresent && (
						<>
							<button onClick={() => setStatColumn(column, 0)}>Use as X</button>
							<button onClick={() => setStatColumn(column, 1)}>Use as Y</button>
						</>
					)}
					{column.type !== 'special' && value !== undefined && (
						<button style={{ maxWidth: 232 }} onClick={() => addFilter(column, value)}>
							Filter {column.name} {defaultFilterOp(column, value)} {valueToString(value)}
						</button>
					)}
				</>
			)}
			{feidId == null && (
				<>
					<div className="separator" />
					<div className="Group">
						<Checkbox text="Show include markers" k="showIncludeMarkers" />
						<Checkbox text="Show column averages" k="showAverages" />
						<Checkbox text="Show changes log" k="showChangelog" />
					</div>
				</>
			)}
		</>
	);
}

function Panel() {
	const { size, params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { columns, data: allData } = useTable('feid');
	const { data: sampleData } = useFeidSample();
	const { data: shownData, columns: shownColumns } = useFeidTableView();
	const { plotUnlistedEvents } = useEventsSettings();
	const { plotId, setPlotId, cursor: sCursor, setCursor } = useEventsState();
	const { addFilter } = useSampleState();
	const ref = useRef<HTMLDivElement | null>(null);
	useSize(ref.current);

	const cursor = sCursor?.entity === 'feid' ? sCursor : null;

	// always plot something
	useEffect(() => {
		if (plotId != null && !allData.find((r) => r[0] === plotId)) {
			const maxId = Math.max(...allData.map((r) => r[0]));
			setPlotId(() => maxId);
		}
	}, [allData, plotId, setPlotId]);

	useEffect(() => {
		const magn = shownColumns.findIndex((col) => col.name === 'magnitude') + 1; // +1 for id col
		if (plotId != null && (plotUnlistedEvents || shownData.find((r) => r[0] === plotId))) return;
		const sorted = shownData.slice(-10).sort((a: any, b: any) => a[magn] - b[magn]);
		setPlotId(() => sorted.at(-1)?.[0] ?? null);
	}, [sampleData, plotId, setPlotId, shownData, shownColumns, plotUnlistedEvents]);

	const plotMove = (dir: -1 | 0 | 1, global?: boolean) => () =>
		setPlotId((current) => {
			if (dir === 0) {
				if (cursor) return shownData[cursor.row][0];
				// set cursor to plotted line
				const found = shownData.findIndex((r) => r[0] === current);
				if (found >= 0) queueMicrotask(() => setCursor({ row: found, column: 0, entity: 'feid', id: current! }));
				return current;
			}
			if (current == null) return null;
			if (plotUnlistedEvents && global)
				return allData[clamp(0, allData.length - 1, allData.findIndex((r) => r[0] === current) + dir)][0];
			const found = shownData.findIndex((r) => r[0] === current);
			if (found >= 0) return shownData[clamp(0, shownData.length - 1, found + dir)][0];
			const aIdx = allData.findIndex((r) => r[0] === current);
			const search = (r: (typeof allData)[number]) => shownData.find((sr) => sr[0] === r[0]);
			const closest = dir > 0 ? allData.slice(aIdx).find(search) : allData.slice(0, aIdx).findLast(search);
			return closest?.[0] ?? null;
		});

	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1, true));
	useEventListener('action+plotNext', plotMove(+1, true));
	useEventListener('action+plotPrevShown', plotMove(-1));
	useEventListener('action+plotNextShown', plotMove(+1));

	useEventListener('action+setX', () => cursor && setStatColumn(shownColumns[cursor.column], 0));
	useEventListener('action+setY', () => cursor && setStatColumn(shownColumns[cursor.column], 1));
	useEventListener('action+computeRow', () => cursor && dispatchCustomEvent('computeRow', { id: shownData[cursor.row][0] }));
	useEventListener('action+addFilter', () => {
		const column = cursor
			? shownColumns[cursor.column]
			: shownColumns.find((col) => col.name === 'magnitude') ??
			  shownColumns.find((col) => col.dtype === 'real') ??
			  columns.find((col) => col.dtype === 'real')!;
		const val = cursor ? shownData[cursor.row][cursor.column + 1] : undefined;
		addFilter(column, val);
	});

	const query = useTableDataQuery('feid');

	if (query.isLoading) return <div className="Center">LOADING..</div>;
	if (!allData.length && query.error) throw query.error;

	return (
		<div className="relative h-full">
			<ImportMenu />
			<ColumnsSelector />
			<SampleView ref={ref} />
			<div className="absolute bottom-0">
				<FeidTableView size={{ ...size, height: size.height - (ref.current?.offsetHeight ?? 28) }} />
			</div>
		</div>
	);
}

export const FeidTable = {
	name: 'FEID Table',
	Menu,
	Panel,
	defaultParams: defaultTableParams,
};
