import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { color, useContextMenu } from '../../app';
import { LayoutContext, openWindow, useNodeExists, type ContextMenuProps } from '../../layout';
import { EventsTable } from './Table';
import { equalValues, valueToString } from '../core/util';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources } from '../core/eventsState';
import { linkHoleSourceEvent, unlinkHoleSourceEvent, useHolesViewState } from '../core/sourceActions';
import { prettyDate } from '../../util';

const SOLEN_PNG_SINCE = new Date(Date.UTC(2015, 12, 12));
const months = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
];

function Menu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu((state) => state.menu?.detail) as { ch?: SolenCH };
	const { id: feidId } = useFeidCursor();
	const ch = detail?.ch;
	const chSrc = useSelectedSource('sources_ch') as CHS | null;

	const isLinked = ch && chSrc && equalValues(ch.tag, chSrc.tag);

	return !ch ? null : (
		<>
			<button
				className="TextButton"
				style={{ color: color(chSrc?.tag ? 'text-dark' : 'text') }}
				onClick={() => feidId && linkHoleSourceEvent('solen', ch, feidId)}
			>
				Link solen CH
			</button>
			{isLinked && (
				<button className="TextButton" onClick={() => unlinkHoleSourceEvent('solen')}>
					Unlink solen CH
				</button>
			)}
		</>
	);
}

function Panel() {
	const framesTotal = 3;
	const { id: nodeId, size, isWindow } = useContext(LayoutContext)!;
	const { time: stateTime, catched } = useHolesViewState();
	const [frame, setFrame] = useState(0);
	const sCursor = useEntityCursor();
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	const query = useSolenHolesQuery();
	const sourceCh = useSelectedSource('sources_ch') as CHS;
	const sources = useCurrentFeidSources();
	const anySourceCh = sourceCh ?? (sources.find((s) => s.ch)?.ch as CHS);
	const chimeraRules = useNodeExists('Chimera Holes');

	const cursor = sCursor?.entity === 'solen_holes' ? sCursor : null;

	useEffect(() => {
		if (chimeraRules) return;
		const inte = setInterval(() => {
			setFrame((f) => (f + 1) % framesTotal);
		}, 750);
		return () => clearInterval(inte);
	}, [chimeraRules]);

	if (!query.data?.data.length) return <div className="Center">LOADING..</div>;

	const { data, columns } = query.data;
	const cursorCh = (catched?.solenHole as SolenCH) ?? (cursor ? (rowAsDict(data[cursor.row], columns) as SolenCH) : sourceCh);

	const isSouth = cursorCh?.location === 'southern';
	const isNorth = cursorCh?.location === 'northern';
	const isEquator = cursorCh?.location === 'trans equatorial';

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 104));
	const clip = isWindow ? 18 : isSouth || isNorth ? 196 : isEquator ? 128 : 48;
	const move = (-clip * imgSize) / 512 - 2;
	const moveY = isWindow ? move : isNorth ? (-18 * imgSize) / 512 : isSouth ? (-374 * imgSize) / 512 : move;

	const focusTime = cursorTime && cursorTime?.getTime() - 2 * 864e5;
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);

	const dtTarget = cursor ? cursorCh.time : anySourceCh ? anySourceCh.time : focusTime == null ? null : new Date(focusTime);
	const dt =
		chimeraRules && Math.abs(stateTime * 1e3 - (dtTarget?.getTime() ?? stateTime)) < 3 * 864e5
			? new Date((Math.round(stateTime / 86400) - 1) * 864e5)
			: dtTarget && new Date(dtTarget?.getTime() + (frame - Math.ceil(framesTotal / 2)) * 864e5);
	const ext = dt && dt >= SOLEN_PNG_SINCE ? 'png' : 'jpg';
	const y = dt?.getUTCFullYear(),
		m = dt?.getUTCMonth(),
		d = dt?.getUTCDate();
	const imgUrl =
		dt &&
		`https://solen.info/solar/old_reports/${y}/${months[m!]}/images/` +
			`AR_CH_${y}${(m! + 1).toString().padStart(2, '00')}${d!.toString().padStart(2, '00')}.${ext}`;

	const textStyle: CSSProperties = {
		position: 'absolute',
		zIndex: 3,
		fontSize: isWindow ? 16 : 10,
		color: 'orange',
		background: 'black',
		padding: '0px 3px',
	};
	return (
		<div>
			{!isWindow && (
				<div style={{ height: size.height - imgSize, position: 'relative', marginTop: -1 }}>
					{
						<EventsTable
							{...{
								entity: 'solen_holes',
								hideBorder: true,
								data,
								columns,
								size: { height: size.height - imgSize, width: size.width - 3 },
								focusIdx,
								onKeydown: (e) => {
									if (cursor && cursorCh && ['+', '='].includes(e.key))
										return feidId && linkHoleSourceEvent('solen', cursorCh, feidId);
									if (cursor && e.key === '-') return unlinkHoleSourceEvent('solen');
								},
								row: (row, idx, onClick, padRow) => {
									const ch = rowAsDict(row as any, columns) as SolenCH;
									const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
									const linkedToThisFEID = sources.find((s) => equalValues(s.ch?.tag, ch.tag));

									const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
									const dark =
										!orange &&
										!timeInMargin(ch.time, focusTime && new Date(focusTime), 5 * 24 * 36e5, 24 * 36e5);

									const className = linkedToThisCH
										? 'text-cyan'
										: dark
										? 'text-text-dark'
										: orange
										? 'text-orange'
										: 'text-text';

									return (
										<DefaultRow
											key={row[0]}
											{...{ row, idx, columns, cursor, className, padRow }}
											onClick={(e, cidx) => {
												if (cidx === 0 && feidId !== null)
													return linkHoleSourceEvent('solen', ch, feidId);
												onClick(idx, cidx);
											}}
											contextMenuData={() => ({ nodeId, ch })}
										>
											{({ column, cidx }) => {
												const value = valueToString(row[cidx]);
												const val =
													column.id === 'tag'
														? value.slice(2)
														: column.id === 'time'
														? value.slice(5, 10)
														: value;
												return <DefaultCell column={column}>{val}</DefaultCell>;
											}}
										</DefaultRow>
									);
								},
							}}
						/>
					}
				</div>
			)}
			{imgUrl && (
				<div
					style={{ cursor: 'pointer', overflow: 'clip', position: 'relative', userSelect: 'none', height: imgSize }}
					onClick={(e) =>
						!isWindow &&
						openWindow({
							x: e.clientX,
							y: e.clientY,
							w: 512,
							h: 512,
							params: { type: 'Solen Holes' },
							unique: nodeId,
						})
					}
				>
					<img
						alt=""
						src={imgUrl}
						draggable={false}
						style={{
							maxWidth: imgSize * (1 + (2 * clip) / 512) - 2,
							transform: `translate(${move}px, ${moveY}px)`,
						}}
					></img>
					<a
						target="_blank"
						rel="noreferrer"
						href={imgUrl}
						onClick={(e) => e.stopPropagation()}
						style={{ ...textStyle, bottom: isWindow ? 6 : 1, right: 0 }}
					>
						≈{prettyDate(new Date(dt.getTime() + 864e5), true)}
					</a>
					<div style={{ ...textStyle, top: -2, left: 0, fontSize: 14 }}>
						<b>{cursorCh?.tag}</b>
					</div>
				</div>
			)}
		</div>
	);
}

export const SolenHoles = {
	name: 'Solen Holes',
	Panel,
	Menu,
};
