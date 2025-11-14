import { useContext } from 'react';
import { sourceLabels, sourceLinks, type Column, type Tables } from '../../api';
import { useContextMenu } from '../../app';
import { LayoutContext } from '../../layout';
import { cn } from '../../util';
import { type TableValue, useTable } from '../core/editableTables';
import { equalValues } from '../core/util';
import { useFeidCursor, useSelectedSource, useEntityCursor } from '../core/eventsState';
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
import { EventsTable } from './Table';

export function EruptiveEntityMenu<T extends EruptTable>({ entity }: { entity: T }) {
	const detail = useContextMenu((state) => state.menu?.detail) as { [key in T]: EruptiveEvent<T> } | undefined;
	const { id } = useFeidCursor();
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
				onClick={() => id && linkEruptiveSourceEvent(entity, event, id)}
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
	cellContent: (val: TableValue, col: Column) => string;
	rowColorCallback: (arg: {
		erupt: Tables['sources_erupt'] | null;
		event: EruptiveEvent<T>;
		feid: Tables['feid'];
	}) => string | null;
};
export function EruptiveEntityTable<T extends EruptTable>({ entity, rowColorCallback, cellContent }: PanelProps<T>) {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const cursor = useEntityCursor(entity);
	const erupt = useSelectedSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const table = useCompoundTable(entity);
	const solar = useSolarPlot();

	const { id: feidId, row: feid } = useFeidCursor();

	if (!table) return <div className="Center">LOADING..</div>;

	const { data, columns, entry } = table;
	const focusTime = solar.focusTime.getTime();
	const timeIdx = table.index[(entity === 'flare' ? 'start_time' : 'time') as keyof typeof table.index];
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[timeIdx] as Date)?.getTime() > focusTime);
	const linked =
		erupt && Object.fromEntries(compoundTables.cme.map((ent) => [sourceLabels[ent], erupt[sourceLinks[ent][0]]]));

	return (
		<EventsTable
			{...{
				entity,
				data,
				columns,
				size,
				focusIdx,
				onKeydown: (e) => {
					if (cursor && erupt && e.key === '-') return unlinkEruptiveSourceEvent(entity, entry(data[cursor.row]));
					if (cursor && ['+', '='].includes(e.key))
						return feidId && linkEruptiveSourceEvent(entity, entry(data[cursor.row]), feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const event = entry(row);
					const link = getSourceLink(entity, event.src);
					const isLinked = equalValues(event[link.id], linked?.[event.src]);

					const className = (() => {
						if (isLinked) return erupt?.cme_source === event.src ? 'text-cyan font-bold' : 'text-cyan/90';
						if (linked?.[event.src])
							// Other similar event linked to current erupt
							return 'text-text-dark';
						const linkIdx = eruptions.index[link.link];
						const linkedTo = eruptions.data?.find((eru) => equalValues(event[link.id], eru[linkIdx]));
						if (linkedTo)
							// This event is already linked to some eruption // FIXME: this is probably slow
							return 'text-text-dark';
						return (feid && rowColorCallback({ erupt, feid, event })) ?? 'text-text';
					})();

					return (
						<DefaultRow
							key={event.src + event[link.id] + row[2]}
							{...{ row, idx, columns, cursor, className, padRow }}
							onClick={(e, cidx) => {
								if (cidx === 0 && feidId !== null) return linkEruptiveSourceEvent(entity, entry(row), feidId);
								onClick(idx, cidx);
							}}
							contextMenuData={() => ({ nodeId, [entity]: event })}
						>
							{({ column, cidx }) => <DefaultCell column={column}>{cellContent(row[cidx], column)}</DefaultCell>}
						</DefaultRow>
					);
				},
			}}
		/>
	);
}
