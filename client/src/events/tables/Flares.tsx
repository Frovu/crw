import { useContext } from 'react';
import { LayoutContext } from '../../layout';
import { DefaultCell, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString, type Flare } from '../events';
import { color, useContextMenu } from '../../app';
import { rowAsDict, useFeidCursor, useEventsState, useSource, useTable, flaresLinks, useSources } from '../eventsState';
import { getSourceLink, linkEruptiveSourceEvent, timeInMargin, unlinkEruptiveSourceEvent, useCompoundTable } from '../sources';

function Menu() {
	const detail = useContextMenu((state) => state.menu?.detail) as { flare: Flare } | undefined;
	const { id } = useFeidCursor();
	const flare = detail?.flare;
	const erupt = useSource('sources_erupt');
	const [linkColId, idColId] = getSourceLink('flare', flare?.src);
	const isLinked = flare && equalValues(flare[idColId as 'start_time'], erupt?.[linkColId]);

	return !flare ? null : (
		<>
			<button
				className="TextButton"
				style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
				onClick={() => id && linkEruptiveSourceEvent('flare', flare, id)}
			>
				Link {flare.src} flare
			</button>
			{isLinked && (
				<button className="TextButton" onClick={() => unlinkEruptiveSourceEvent('flare', flare)}>
					Unlink {flare.src as string} flare
				</button>
			)}
		</>
	);
}

function Panel() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'flares' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const sources = useSources();

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('flare');
	const { start: cursorTime, id: feidId, row: feid } = useFeidCursor();
	if (!data.length) return <div className="Center">LOADING..</div>;

	const [timeIdx] = ['start'].map((what) => columns.findIndex((c) => c.name === what));
	const focusTime = erupt?.flr_start
		? erupt?.flr_start.getTime()
		: erupt?.cme_time
		? erupt?.cme_time.getTime()
		: cursorTime && cursorTime.getTime() - 2 * 864e5;
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[timeIdx] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(Object.entries(flaresLinks).map(([src, lnk]) => [src, erupt[lnk[0]]]));

	return (
		<TableWithCursor
			{...{
				entity: 'flares',
				data,
				columns,
				size,
				focusIdx,
				onKeydown: (e) => {
					if (cursor && erupt && e.key === '-')
						return unlinkEruptiveSourceEvent('flare', rowAsDict(data[cursor.row], columns) as Flare);
					if (cursor && ['+', '='].includes(e.key))
						return feidId && linkEruptiveSourceEvent('flare', rowAsDict(data[cursor.row], columns) as Flare, feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const flare = rowAsDict(row, columns) as Flare;
					const stime = flare.start_time?.getTime();
					const [linkColId, idColId] = getSourceLink('flare', flare.src);
					const isLinked = equalValues(flare[idColId], linked?.[flare.src]);
					const isPrime = isLinked && erupt?.flr_source === flare.src;
					const otherLinked = !isLinked && linked?.[flare.src];
					const linkedToAnyErupt = sources.find((s) => equalValues(s.erupt?.[linkColId], flare[idColId]));

					const orange =
						!isLinked &&
						!otherLinked &&
						!linkedToAnyErupt &&
						(() => {
							if (timeInMargin(flare.start_time, erupt?.flr_start, 6e5)) return true;
							if (
								flare.linked_events &&
								erupt?.cme_time &&
								flare.linked_events.find(
									(lnk) => lnk.includes('CME') && timeInMargin(erupt?.cme_time, new Date(lnk.slice(0, 19) + 'Z'), 6e5)
								)
							)
								return true;
							if (feid.flr_time && timeInMargin(flare.start_time, feid.flr_time, 6e5)) return true;
							return false;
						})();

					const darkk =
						otherLinked ||
						(!erupt?.flr_start
							? stime > focusTime! + 2 * 864e5 || stime < focusTime! - 3 * 864e5
							: stime > focusTime! + 36e5 * 4 || stime < focusTime! - 36e5 * 4);

					// FIXME: this is probably slow
					const eruptLinkIdx = !darkk && eruptions.columns?.findIndex((col) => col.id === linkColId);
					const dark = darkk || (eruptLinkIdx && eruptions.data?.find((eru) => equalValues(flare[idColId], eru[eruptLinkIdx])));

					const textColor = isLinked ? (isPrime ? 'cyan' : 'cyan/80') : orange ? 'orange' : dark ? 'text-dark' : 'text';

					return (
						<DefaultRow
							key={row[0] + stime + flare.end_time?.getTime()}
							{...{ row, idx, columns, cursor, textColor, padRow }}
							onClick={(e, cidx) => {
								if (cidx === 0 && feidId !== null)
									return linkEruptiveSourceEvent('flare', rowAsDict(row, columns) as Flare, feidId);
								onClick(idx, cidx);
							}}
							contextMenuData={() => ({ nodeId, flare })}
						>
							{({ column, cidx }) => {
								let value = valueToString(row[cidx]);
								if (['peak', 'end'].includes(column.name)) value = value.split(' ')[1];
								return <DefaultCell column={column}>{value}</DefaultCell>;
							}}
						</DefaultRow>
					);
				},
			}}
		/>
	);
}

export const FlaresTable = {
	name: 'Flares Table',
	Panel,
	Menu,
};
