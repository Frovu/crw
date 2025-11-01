import { useContext } from 'react';
import { useContextMenu, color } from '../../app';
import { LayoutContext, openWindow } from '../../layout';
import { DefaultCell, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString, type CME, type ICME } from '../events';
import { cmeLinks, rowAsDict, useEventsState, useFeidCursor, useSource, useSources, useTable } from '../eventsState';
import {
	getSourceLink,
	linkEruptiveSourceEvent,
	sourceLabels,
	timeInMargin,
	unlinkEruptiveSourceEvent,
	useCompoundTable,
} from '../sources';

function Menu() {
	const detail = useContextMenu((state) => state.menu?.detail) as { cme: CME } | undefined;
	const { id } = useFeidCursor();
	const cme = detail?.cme;
	const erupt = useSource('sources_erupt');
	const src = cme?.src;
	const [linkColId, idColId] = getSourceLink('cme', src);
	const isLinked = cme && equalValues(cme[idColId], erupt?.[linkColId]);

	return !cme ? null : (
		<>
			<button
				className="TextButton"
				style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
				onClick={() => id && linkEruptiveSourceEvent('cme', cme, id)}
			>
				Link {src} CME
			</button>
			{isLinked && (
				<button className="TextButton" onClick={() => unlinkEruptiveSourceEvent('cme', cme)}>
					Unlink {src} CME
				</button>
			)}
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

function Panel() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'CMEs' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const icmes = useCompoundTable('icme');
	const sources = useSources();

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('cme');
	const { start: cursorTime, id: feidId, row: feid } = useFeidCursor();
	if (!data.length) return <div className="Center">LOADING..</div>;

	const icmeTimeIdx = icmes.columns.findIndex((c) => c.name === 'time');
	const eruptIcme =
		erupt?.rc_icme_time == null
			? null
			: (rowAsDict(
					icmes.data.find((r) => equalValues(erupt.rc_icme_time, r[icmeTimeIdx])),
					icmes.columns
			  ) as ICME);
	const icmeCmeTimes = eruptIcme?.cmes_time?.at(0);
	const icmeCmeTime = icmeCmeTimes == null ? null : new Date(icmeCmeTimes.slice(0, 19) + 'Z');
	const focusTime = (erupt?.cme_time ?? icmeCmeTime ?? erupt?.flr_start)?.getTime() ?? (cursorTime && cursorTime.getTime() - 2 * 864e5);
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(sourceLabels.cme.map((src) => [src, erupt[cmeLinks[src][0]]]));

	return (
		<TableWithCursor
			{...{
				entity: 'CMEs',
				data,
				columns,
				size,
				focusIdx,
				onKeydown: (e) => {
					if (cursor && erupt && e.key === '-')
						return unlinkEruptiveSourceEvent('cme', rowAsDict(data[cursor.row], columns) as CME);
					if (cursor && ['+', '='].includes(e.key))
						return feidId && linkEruptiveSourceEvent('cme', rowAsDict(data[cursor.row], columns) as CME, feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const cme = rowAsDict(row, columns) as CME;
					const time = cme.time.getTime();
					const [linkColId, idColId] = getSourceLink('cme', cme.src);
					const isLinked = equalValues(cme[idColId], linked?.[cme.src]);
					const isPrime = isLinked && erupt?.cme_source === cme.src;
					const otherLinked = !isLinked && linked?.[cme.src];
					const darkk =
						otherLinked ||
						(!erupt?.cme_time
							? time > focusTime! + 864e5 || time < focusTime! - 3 * 864e5
							: time > focusTime! + 36e5 * 4 || time < focusTime! - 36e5 * 4);
					const eruptLinkIdx = !darkk && eruptions.columns?.findIndex((col) => col.id === linkColId);
					const dark = darkk || (eruptLinkIdx && eruptions.data?.find((eru) => equalValues(cme[idColId], eru[eruptLinkIdx])));

					const orange =
						!dark &&
						(() => {
							if (timeInMargin(cme.time, erupt?.cme_time, 6e5)) return true;
							if (
								cme.linked_events?.find(
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
								const icme = rowAsDict(
									icmes.data.find((r) => equalValues(anyEruptIcme, r[icmeTimeIdx])),
									icmes.columns
								) as ICME;
								for (const meTime of icme.cmes_time ?? [])
									if (timeInMargin(cme.time, new Date(meTime.slice(0, 19) + 'Z'), 6e5)) return true;
							}
							return false;
						})();

					const textColor = isLinked ? (isPrime ? 'cyan' : 'cyan/80') : orange ? 'orange' : dark ? 'text-dark' : 'text';

					return (
						<DefaultRow
							key={row[0] + time + row[2] + row[4]}
							{...{ row, idx, columns, cursor, textColor, padRow }}
							onClick={(e, cidx) => {
								if (cidx === 0 && feidId !== null)
									return linkEruptiveSourceEvent('cme', rowAsDict(row, columns) as CME, feidId);
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
