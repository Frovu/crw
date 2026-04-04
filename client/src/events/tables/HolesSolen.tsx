import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useEventsContextMenu } from '../../app/app';
import { LayoutContext, openWindow, useNodeExists } from '../../app/layout';
import { EventsTable } from './Table';
import { equalValues, valueToString } from '../core/util';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources, useEntityCursor } from '../core/eventsState';
import { linkHoleSourceEvent, unlinkHoleSourceEvent, useHolesViewState } from '../core/sourceActions';
import { cn, prettyDate } from '../../util';
import { Button } from '../../components/Button';
import { useTableDataQuery } from '../core/query';
import { tableRowAsDict } from '../core/editableTables';

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

function Menu() {
	const menu = useEventsContextMenu<'solen_holes'>();
	const { id: feidId } = useFeidCursor();
	const ch = menu?.event;
	const chSrc = useSelectedSource('sources_ch');

	const isLinked = ch && chSrc && equalValues(ch.tag, chSrc.tag);

	return !ch ? null : (
		<>
			<Button
				className={cn(chSrc?.tag && 'text-dark')}
				onClick={() => feidId && linkHoleSourceEvent('solen_holes', ch, feidId)}
			>
				Link solen CH
			</Button>
			{isLinked && <Button onClick={() => unlinkHoleSourceEvent('solen_holes')}>Unlink solen CH</Button>}
		</>
	);
}

function Panel() {
	const framesTotal = 3;
	const { id: nodeId, size, isWindow } = useContext(LayoutContext)!;
	const { time: stateTime, catched } = useHolesViewState();
	const [frame, setFrame] = useState(0);
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	const query = useTableDataQuery('solen_holes');
	const sourceCh = useSelectedSource('sources_ch');
	const sources = useCurrentFeidSources();
	const anySourceCh = sourceCh ?? sources.find((s) => s.ch)?.ch;
	const chimeraRules = useNodeExists('Chimera Holes');

	const cursor = useEntityCursor('solen_holes');

	useEffect(() => {
		if (chimeraRules) return;
		const inte = setInterval(() => {
			setFrame((f) => (f + 1) % framesTotal);
		}, 750);
		return () => clearInterval(inte);
	}, [chimeraRules]);

	if (!query.data?.data.length) return <div className="center">LOADING..</div>;

	const { data, columns } = query.data;
	const sourceSolenCh = anySourceCh?.tag && data.find((row) => equalValues(row[0], anySourceCh?.tag));
	const cursorCh =
		catched?.solenHole ??
		(cursor
			? tableRowAsDict<'solen_holes'>(data[cursor.row], columns)
			: sourceSolenCh
				? tableRowAsDict<'solen_holes'>(sourceSolenCh, columns)
				: null);

	const isSouth = cursorCh?.location === 'southern';
	const isNorth = cursorCh?.location === 'northern';
	const isEquator = cursorCh?.location === 'trans equatorial';

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 104));
	const clip = isWindow ? 18 : isSouth || isNorth ? 196 : isEquator ? 128 : 48;
	const move = (-clip * imgSize) / 512 - 2;
	const moveY = isWindow ? move : isNorth ? (-18 * imgSize) / 512 : isSouth ? (-374 * imgSize) / 512 : move;

	const focusTime = cursorTime && cursorTime?.getTime() - 2 * 864e5;
	const focusIdx = focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);

	const dtTarget = cursorCh ? cursorCh.time : anySourceCh ? anySourceCh.time : focusTime == null ? null : new Date(focusTime);
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

	return (
		<div>
			{!isWindow && (
				<div style={{ position: 'relative', height: size.height - imgSize, marginTop: -1, marginLeft: -1 }}>
					{
						<EventsTable
							{...{
								entity: 'solen_holes',
								data,
								columns,
								size: { height: size.height - imgSize, width: size.width - 3 },
								focusIdx,
								onKeydown: (e) => {
									if (cursor && cursorCh && ['+', '='].includes(e.key))
										return feidId && linkHoleSourceEvent('solen_holes', cursorCh, feidId);
									if (cursor && e.key === '-') return unlinkHoleSourceEvent('solen_holes');
								},
								onClick: (e, row, column) => {
									if (feidId != null && column.name === 'tag') {
										const ch = tableRowAsDict<'solen_holes'>(row, columns);
										linkHoleSourceEvent('solen_holes', ch, feidId);
										return true;
									}
								},
								rowClassName: (row) => {
									const ch = tableRowAsDict<'solen_holes'>(row, columns);
									const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
									if (linkedToThisCH) return 'text-cyan';
									const linkedToThisFEID = sources.find((s) => equalValues(s.ch?.tag, ch.tag));
									const orange = !linkedToThisFEID && (feid?.s_description as string)?.includes(ch.tag);
									if (orange) return 'text-orange';
								},
								cellContent: (val, column) => {
									const value = valueToString(val);
									return column.name === 'tag'
										? value.slice(2)
										: column.name === 'time'
											? value.slice(5, 10)
											: value;
								},
							}}
						/>
					}
				</div>
			)}
			{imgUrl && (
				<div
					className="cursor-pointer overflow-clip relative select-none"
					style={{ height: imgSize }}
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
						className={cn(
							'absolute right-0 z-3 !text-orange-400 bg-black px-1',
							isWindow ? 'text-lg bottom-[6px]' : 'text-xs bottom-[1px]',
						)}
						target="_blank"
						rel="noreferrer"
						href={imgUrl}
						onClick={(e) => e.stopPropagation()}
					>
						≈{prettyDate(new Date(dt.getTime() + 864e5), true)}
					</a>
					<div
						className={cn(
							'absolute left-0 z-3 -top-[2px] !text-orange-400 bg-black px-1',
							isWindow ? 'text-lg' : 'text-xs',
						)}
					>
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
