import { sourceLabels, sourceLinks, type Tables } from '../../api';
import { useContextMenuStore } from '../../app';
import { cn } from '../../util';
import { type TableValue, useTable } from '../core/editableTables';
import { equalValues } from '../core/util';
import { useSelectedSource, getPlottedFeid } from '../core/eventsState';
import { useSolarPlot } from '../core/plot';
import { useCompoundTable } from '../core/query';
import {
	type EruptTable,
	type EruptiveEvent,
	getSourceLink,
	linkEruptiveSourceEvent,
	unlinkEruptiveSourceEvent,
	compoundTables,
} from '../core/sourceActions';
import { EventsTable, type TableColumn } from './Table';
import { useMemo } from 'react';

export function EruptiveEntityMenu<T extends EruptTable>({ entity }: { entity: T }) {
	const detail = useContextMenuStore((state) => state.menu?.detail) as { [key in T]: EruptiveEvent<T> } | undefined;
	const event = detail?.[entity];
	const erupt = useSelectedSource('sources_erupt');

	if (!event) return null;

	const src = event.src;
	const link = getSourceLink(entity, src);
	const isLinked = equalValues(event[link.id], erupt?.[link.link]);

	return (
		<>
			<button
				className={cn('TextButton', erupt?.[link.link] ? 'text-text-dark' : 'text-text')}
				onClick={() => linkEruptiveSourceEvent(entity, event)}
			>
				Link {src} {entity.toUpperCase()}
			</button>
			{isLinked && (
				<button className="TextButton" onClick={() => unlinkEruptiveSourceEvent(entity, event)}>
					Unlink {src} {entity.toUpperCase()}
				</button>
			)}
		</>
	);
}

type PanelProps<T extends EruptTable> = {
	entity: T;
	cellContent: (val: TableValue, col: TableColumn) => string;
	rowColorCallback: (arg: {
		erupt: Tables['sources_erupt'] | null;
		event: EruptiveEvent<T>;
		feid: Tables['feid'];
	}) => string | null;
};
export function EruptiveEntityTable<T extends EruptTable>({ entity, rowColorCallback, cellContent }: PanelProps<T>) {
	const erupt = useSelectedSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const table = useCompoundTable(entity);
	const solar = useSolarPlot();
	const focusTime = solar.focusTime.getTime();
	const timeIdx = table?.index[(entity === 'flare' ? 'start_time' : 'time') as keyof typeof table.index];
	const focusIdx =
		focusTime == null ? table?.data.length : table?.data.findIndex((r) => (r[timeIdx!] as Date)?.getTime() > focusTime);
	const linked =
		erupt && Object.fromEntries(compoundTables.cme.map((ent) => [sourceLabels[ent], erupt[sourceLinks[ent][0]]]));

	return useMemo(() => {
		if (!table) return <div className="Center">LOADING..</div>;
		const { data, columns, entry } = table;

		return (
			<EventsTable
				{...{
					entity,
					data,
					columns,
					focusIdx,
					cellContent,
					onClick: (e, row, column) => {
						if (column.name === 'src') {
							linkEruptiveSourceEvent(entity, entry(row));
							return true;
						}
					},
					onKeydown: (e, cursor) => {
						if (erupt && e.key === '-') return unlinkEruptiveSourceEvent(entity, entry(data[cursor.row]));
						if (['+', '='].includes(e.key)) return linkEruptiveSourceEvent(entity, entry(data[cursor.row]));
					},
					rowClassName: (row, ridx) => {
						const event = entry(row);
						const link = getSourceLink(entity, event.src);
						const isLinked = equalValues(event[link.id], linked?.[event.src]);
						if (isLinked) return erupt?.cme_source === event.src ? 'text-cyan font-bold' : 'text-cyan/90';
						if (linked?.[event.src])
							// Other similar event linked to current erupt
							return 'text-text-dark';
						const linkIdx = eruptions.index[link.link];
						const linkedTo = eruptions.data?.find((eru) => equalValues(event[link.id], eru[linkIdx]));
						if (linkedTo)
							// This event is already linked to some eruption // FIXME: this is probably slow
							return 'text-text-dark';

						const feid = getPlottedFeid();
						return (feid && rowColorCallback({ erupt, feid, event })) ?? 'text-text';
					},
				}}
			/>
		);
	}, [cellContent, entity, erupt, eruptions.data, eruptions.index, focusIdx, linked, rowColorCallback, table]);
}
