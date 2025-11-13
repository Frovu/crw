import { useContext } from 'react';
import { useContextMenu } from '../../app';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { DefaultCell, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString } from '../core/util';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources } from '../core/eventsState';
import { linkSrcToEvent } from '../core/sourceActions';
import { askConfirmation } from '../../Utility';

const ENT = 'sources_ch';

function deleteHole(id: number) {
	askConfirmation(
		<>
			<h4>Delete CHS event?</h4>
			<p>Action is irreversible</p>
		</>,
		() => deleteEvent(ENT, id)
	);
}

function Menu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const { id: feidId } = useFeidCursor();
	const detail = useContextMenu((state) => state.menu?.detail) as { ch: CHS } | undefined;
	const sources = useCurrentFeidSources();
	const chsId = detail?.ch?.id;
	const isLinked = sources.find((s) => s.ch?.id === chsId);

	return (
		chsId && (
			<>
				{feidId && !isLinked && (
					<button className="TextButton" onClick={() => linkSrcToEvent(ENT, chsId, feidId)}>
						Link CHS
					</button>
				)}
				{feidId && isLinked && (
					<button className="TextButton" onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>
						Unlink CHS
					</button>
				)}
				<button className="TextButton" onClick={() => deleteHole(chsId)}>
					Delete row
				</button>
			</>
		)
	);
}

function Panel() {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const sCursor = useEntityCursor();
	const { start: cursorTime, row: feid } = useFeidCursor();
	const { data, columns } = useTable(ENT);
	const feidSrc = useTable('feid_sources');
	const sourceCh = useSelectedSource(ENT);
	const sources = useCurrentFeidSources();
	const cursor = sCursor?.entity === ENT ? sCursor : null;

	useTableQuery(ENT);

	if (!data || !feidSrc.data || !columns) return <div className="Center">LOADING..</div>;

	const focusTime = cursorTime && cursorTime.getTime() - 2 * 864e5;
	const focusIdxFound =
		sources.map((src) => data.findIndex((r) => src.ch?.id === r[0])).find((i) => i > 0) ||
		(focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime));
	const focusIdx = focusIdxFound < 0 ? data.length - 1 : focusIdxFound;

	return (
		<div>
			{
				<TableWithCursor
					{...{
						entity: ENT,
						data,
						columns,
						size,
						focusIdx,
						head: (cols, padHeader) => <DefaultHead {...{ columns: cols.slice(1), padHeader }} />,
						row: (row, idx, onClick, padRow) => {
							const ch = rowAsDict(row as any, columns) as CHS;
							const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
							const linkedToThisFEID = sources.find((s) => equalValues(s.ch?.tag, ch.tag));

							const orphan = !feidSrc.data.find((r) => r[chIdIdx] === row[0]);
							const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
							const dark =
								!orange &&
								!orphan &&
								!timeInMargin(ch.time, focusTime && new Date(focusTime), 5 * 24 * 36e5, 1 * 36e5);

							const className = orphan
								? 'text-red'
								: linkedToThisCH
								? 'text-cyan'
								: dark
								? 'text-text-dark'
								: orange
								? 'text-orange'
								: 'text-text';

							return (
								<DefaultRow
									key={row[0]}
									{...{ row, idx, columns: columns.slice(1), cursor, className, padRow }}
									onClick={(e, cidx) => onClick(idx, cidx)}
									contextMenuData={() => ({ nodeId, ch })}
									title={(cidx) =>
										(cidx === 1 ? `id = ${row[0]}; ` : '') +
										`${columns[cidx].fullName} = ${valueToString(row[cidx + 1])}`
									}
								>
									{({ column, cidx }) => (
										<DefaultCell column={column}>{valueToString(row[cidx + 1])}</DefaultCell>
									)}
								</DefaultRow>
							);
						},
					}}
				/>
			}
		</div>
	);
}

export const HolesTable = {
	name: 'Holes Src Table',
	Panel,
	Menu,
};
