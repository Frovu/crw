import { useContext } from 'react';
import { useContextMenu, color } from '../../app';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { DefaultCell, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString, type ICME } from '../events';
import { icmeLinks, rowAsDict, useEventsState, useFeidCursor, useSource, useSources } from '../eventsState';
import {
	getSourceLink,
	linkEruptiveSourceEvent,
	sourceLabels,
	timeInMargin,
	unlinkEruptiveSourceEvent,
	useCompoundTable,
} from '../sources';

function Menu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu((state) => state.menu?.detail) as { icme: ICME } | undefined;
	const { id } = useFeidCursor();
	const icme = detail?.icme;
	const erupt = useSource('sources_erupt');
	const src = icme?.src as string;
	const [linkColId, idColId] = getSourceLink('icme', src);
	const isLinked = icme && equalValues(icme[idColId], erupt?.[linkColId]);

	return !icme ? null : (
		<>
			<button
				className="TextButton"
				style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
				onClick={() => id && linkEruptiveSourceEvent('icme', icme, id)}
			>
				Link {src} ICME
			</button>
			{isLinked && (
				<button className="TextButton" onClick={() => unlinkEruptiveSourceEvent('icme', icme)}>
					Unlink {src} ICME
				</button>
			)}
			<div className="separator" />
			<a className="Row" href="https://izw1.caltech.edu/ACE/ASC/DATA/level3/icmetable2.htm" target="_blank" rel="noreferrer">
				R&C Catalogue
			</a>
		</>
	);
}

function Panel() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'ICMEs' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const sources = useSources();
	// const eruptions = useTable('sources_erupt');

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('icme');
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	if (!data.length) return <div className="Center">LOADING..</div>;

	const focusTime = cursorTime?.getTime();
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(sourceLabels.icme.map((src) => [src, erupt[icmeLinks[src][0]]]));

	return (
		<TableWithCursor
			{...{
				entity: 'ICMEs',
				data,
				columns,
				size,
				focusIdx,
				onKeydown: (e) => {
					if (cursor && erupt && e.key === '-')
						return unlinkEruptiveSourceEvent('icme', rowAsDict(data[cursor.row] as any, columns) as ICME);
					if (cursor && ['+', '='].includes(e.key))
						return feidId && linkEruptiveSourceEvent('icme', rowAsDict(data[cursor.row] as any, columns) as ICME, feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const icme = rowAsDict(row as any, columns);
					const time = (icme.time as any)?.getTime();
					const isLinked = equalValues(icme.time, linked?.[icme.src as any]);
					const linkedToAnyErupt = sources.find((s) => equalValues(s.erupt?.[getSourceLink('icme', icme.src)[0]], icme.time));

					const orange =
						!isLinked &&
						!linkedToAnyErupt &&
						(timeInMargin(icme.time, cursorTime, 36e5) || (feid.mc_time && timeInMargin(icme.body_start, feid.mc_time, 36e5)));
					const dark = linkedToAnyErupt || (!orange && !timeInMargin(icme.time, cursorTime, 24 * 36e5));

					const textColor = isLinked ? 'cyan' : dark ? 'text-dark' : orange ? 'orange' : 'text';

					return (
						<DefaultRow
							key={row[0] + time + row[2]}
							{...{ row, idx, columns, cursor, textColor, padRow }}
							onClick={(e, cidx) => {
								if (cidx === 0 && feidId !== null)
									return linkEruptiveSourceEvent('icme', rowAsDict(row as any, columns) as ICME, feidId);
								onClick(idx, cidx);
							}}
							contextMenuData={() => ({ nodeId, icme })}
						>
							{({ column, cidx }) => <DefaultCell column={column}>{valueToString(row[cidx])}</DefaultCell>}
						</DefaultRow>
					);
				},
			}}
		/>
	);
}

export const ICMETable = {
	name: 'ICME Table',
	Panel,
	Menu,
};
