import { useContext, type ReactNode } from 'react';
import { useContextMenu, color } from '../../app';
import { LayoutContext, openWindow } from '../../layout';
import { DefaultCell, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString } from '../core/eventsSettings';
import { useCurrentFeidSources, useEntityCursor, useFeidCursor, useSelectedSource } from '../core/eventsState';
import {
	compoundTables,
	getSourceLink,
	linkEruptiveSourceEvent,
	unlinkEruptiveSourceEvent,
	type EruptiveEvent,
	type EruptTable,
} from '../core/sourceActions';
import { sourceLabels, sourceLinks } from '../../api';
import { cn, timeInMargin } from '../../util';
import { useTable, type TableValue } from '../core/editableTables';
import { useSolarPlot } from '../core/plot';
import { useCompoundTable } from '../core/query';

function EruptiveEntityMenu<T extends EruptTable>({ entity }: { entity: T }) {
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

function CMEMenu() {
	return (
		<>
			<EruptiveEntityMenu entity="cme" />
			<button
				className="TextButton"
				onClick={(e) =>
					openWindow({
						x: e.clientX - 200,
						y: e.clientY - 200,
						w: 800,
						h: 400,
						params: { type: 'Sun View', mode: 'WSA-ENLIL' } as any,
						unique: 'enlil-view',
					})
				}
			>
				Open ENLIL view
			</button>
			<div className="separator" />
			<a className="Row" href="https://cdaw.gsfc.nasa.gov/CME_list/" target="_blank" rel="noreferrer">
				LASCO Catalogue
			</a>
		</>
	);
}

type PanelProps<T extends EruptTable> = {
	entity: T;
	cellContent: (val: TableValue) => string;
	rowColorCallback: () => string | null;
};
function EruptiveEntityPanel<T extends EruptTable>({ entity, rowColorCallback, cellContent }: PanelProps<T>) {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const cursor = useEntityCursor(entity);
	const erupt = useSelectedSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const table = useCompoundTable(entity);
	const solar = useSolarPlot();

	const { id: feidId } = useFeidCursor();

	if (!table) return <div className="Center">LOADING..</div>;

	const { data, columns, entry } = table;
	const focusTime = solar.focusTime.getTime();
	const timeIdx = table.index[(entity === 'flare' ? 'start_time' : 'time') as keyof typeof table.index];
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[timeIdx] as Date)?.getTime() > focusTime);
	const linked =
		erupt && Object.fromEntries(compoundTables.cme.map((ent) => [sourceLabels[ent], erupt[sourceLinks[ent][0]]]));

	return (
		<TableWithCursor
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
						return rowColorCallback() ?? 'text-text';
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
							{({ column, cidx }) => <DefaultCell column={column}>{valueToString(row[cidx])}</DefaultCell>}
						</DefaultRow>
					);
				},
			}}
		/>
	);
}

function Panel() {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const cursor = useEntityCursor('cme');
	const erupt = useSelectedSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const icmes = useCompoundTable('icme');
	const cmes = useCompoundTable('cme');
	const sources = useCurrentFeidSources();
	const solar = useSolarPlot();
	const { id: feidId, row: feid } = useFeidCursor();

	if (!cmes || !icmes) return <div className="Center">LOADING..</div>;

	const { data, columns } = cmes;
	const focusTime = solar.focusTime.getTime();
	const icmeTimeIdx = icmes.index.time;
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);
	const linked =
		erupt && Object.fromEntries(compoundTables.cme.map((entity) => [sourceLabels[entity], erupt[sourceLinks[entity][0]]]));

	return (
		<TableWithCursor
			{...{
				entity: 'cme',
				data,
				columns,
				size,
				focusIdx,
				onKeydown: (e) => {
					if (cursor && erupt && e.key === '-') return unlinkEruptiveSourceEvent('cme', cmes.entry(data[cursor.row]));
					if (cursor && ['+', '='].includes(e.key))
						return feidId && linkEruptiveSourceEvent('cme', cmes.entry(data[cursor.row]), feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const cme = cmes.entry(row);
					const time = cme.time.getTime();
					const link = getSourceLink('cme', cme.src);
					const isLinked = equalValues(cme[link.id], linked?.[cme.src]);
					const isPrime = isLinked && erupt?.cme_source === cme.src;
					const otherLinked = !isLinked && linked?.[cme.src];
					const darkk = otherLinked;

					// TODO: addd expected time estimation

					// FIXME: this is probably slow
					const eruptLinkIdx = !darkk && eruptions.index[link.link];
					const dark =
						darkk || (eruptLinkIdx && eruptions.data?.find((eru) => equalValues(cme[link.id], eru[eruptLinkIdx])));

					const orange =
						!dark &&
						(() => {
							if (erupt?.cme_time && timeInMargin(cme.time, erupt.cme_time, 6e5)) return true;
							if (
								cme.linked_events?.split(',').find(
									// FIXME this mirht be bbroken (or not)
									(lnk) =>
										(lnk.includes('GST') || lnk.includes('IPS')) &&
										timeInMargin(feid.time, new Date(lnk.slice(0, 19) + 'Z'), 8 * 36e5)
								)
							)
								return true;
							if (feid.cme_time) {
								if (timeInMargin(cme.time, feid.cme_time, 6e5)) return true;
							}
							const anyEruptIcme = sources.find((s) => s.erupt?.rc_icme_time)?.erupt?.rc_icme_time;
							if (anyEruptIcme) {
								const found = icmes.data.find((r) => equalValues(anyEruptIcme, r[icmeTimeIdx]));
								const icme = found && icmes.entry(found);
								for (const meTime of icme?.cmes_time ?? [])
									if (timeInMargin(cme.time, new Date(meTime.slice(0, 19) + 'Z'), 6e5)) return true;
							}
							return false;
						})();

					const className = isLinked
						? isPrime
							? 'text-cyan font-bold'
							: 'text-cyan/90'
						: orange
						? 'text-orange'
						: dark
						? 'text-text-dark'
						: 'text-text';

					return (
						<DefaultRow
							key={row[0] + time + row[2] + row[4]}
							{...{ row, idx, columns, cursor, className, padRow }}
							onClick={(e, cidx) => {
								if (cidx === 0 && feidId !== null)
									return linkEruptiveSourceEvent('cme', cmes.entry(row), feidId);
								onClick(idx, cidx);
							}}
							contextMenuData={() => ({ nodeId, cme })}
						>
							{({ column, cidx }) => <DefaultCell column={column}>{valueToString(row[cidx])}</DefaultCell>}
						</DefaultRow>
					);
				},
			}}
		/>
	);
}

export const CMETable = {
	name: 'CME Table',
	Panel,
	Menu,
};
