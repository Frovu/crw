import { type MouseEvent } from 'react';
import { color, logSuccess, useContextMenuStore } from '../../app';
import { cn, prettyDate, useEventListener } from '../../util';
import CoverageControls from './CoverageControls';
import { openWindow } from '../../layout';
import { createFeid, deleteEvent, getTable, linkSource, makeChange, useTable } from '../core/editableTables';
import { useFeidCursor, useEventsState, useCurrentFeidSources, type FeidSource } from '../core/eventsState';
import type { StaticColumn } from '../../api';
import { Button } from '../../components/Button';
import { NumberInput, TextInput } from '../../components/Input';
import SourcesList from './SourcesList';

const roundHour = (t: number) => Math.floor(t / 36e5) * 36e5;

function Menu() {
	const { id: feidId } = useFeidCursor();
	const detail = useContextMenuStore((state) => state.menu?.detail) as FeidSource | undefined;

	return (
		<>
			{detail?.source && <Button onClick={() => deleteEvent('feid_sources', detail.source.id)}>Delete source</Button>}
			{feidId && (
				<Button
					onClick={() => {
						const srcId = linkSource('sources_erupt', feidId);
						setTimeout(() => {
							const { setCursor } = useEventsState.getState();
							setCursor({
								entity: 'sources_erupt',
								column: 2,
								row: getTable('sources_erupt').data.findIndex((row) => row[0] === srcId),
								id: srcId,
							});
						}, 100);
					}}
				>
					Add new eruption
				</Button>
			)}
			<div className="separator" />
			<Button
				onClick={(e) =>
					openWindow({
						x: e.clientX,
						y: e.clientY - 200,
						w: 200,
						h: 120,
						params: { type: 'SWPC Hint' } as any,
						unique: 'swpc-hint',
					})
				}
			>
				Open SWPC hint
			</Button>
		</>
	);
}

function Panel() {
	const { modifyId, setStartAt, setEndAt, plotId, modifySourceId, setStart, setEnd, setModify, setModifySource, setPlotId } =
		useEventsState();
	const { start, end, duration, id: feidId, row: feid } = useFeidCursor();
	const { columns } = useTable('feid');
	const sources = useCurrentFeidSources();

	const isLink = modifySourceId;
	const isMove = !isLink && modifyId != null;
	const isInsert = !isMove && (setStartAt != null || setEndAt != null);
	const isIdle = !isMove && !isInsert && !isLink;

	const escape = () => {
		setModifySource(null);
		setModify(null);
		setStart(null);
		setEnd(null);
	};

	const toggle = (what: 'insert' | 'move' | 'link') => (e?: MouseEvent) => {
		if (e) (e.target as HTMLButtonElement)?.blur();
		if (!isIdle || !start) return escape();
		if (what === 'move' || what === 'link') feidId && setModify(feidId);
		if (what === 'link') return;
		const at = what === 'insert' ? roundHour(end?.getTime() ?? start.getTime()) : start.getTime();
		setStart(new Date(at));
	};

	const handleEnter = () => {
		if (!end || !columns || !feidId) return;
		if (setStartAt && setEndAt) {
			const dur = (setEndAt.getTime() - setStartAt.getTime()) / 36e5;
			if (isMove) {
				makeChange('feid', { column: 'time', id: feidId, value: setStartAt, fast: true });
				makeChange('feid', { column: 'duration', id: feidId, value: dur });
				logSuccess(`Moved FEID #${feidId} to ${prettyDate(setStartAt)}`);
			}
			if (isInsert) {
				const createdId = createFeid({ time: setStartAt, duration: dur });
				setPlotId(() => createdId);
			}
			return escape();
		}
		if (setStartAt) {
			const at = isInsert ? setStartAt.getTime() + 864e5 : end.getTime();
			return setEnd(new Date(at));
		}
	};

	const deleteFeid = () => {
		if (feidId) deleteEvent('feid', feidId);
	};

	useEventListener('escape', escape);

	useEventListener('plotClick', (e: CustomEvent<{ timestamp: number }>) => {
		const hour = new Date(roundHour(e.detail.timestamp * 1000));

		if (setEndAt) setEnd(hour);
		else if (setStartAt) setStart(hour);
	});

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code === 'Insert') return toggle('insert')();
		if (['Enter', 'NumpadEnter'].includes(e.code)) return handleEnter();
		if (!setStartAt && !setEndAt) return;
		const move = {
			ArrowRight: 36e5,
			ArrowLeft: -36e5,
		}[e.code];
		if (!move) return;
		const mul = e.ctrlKey ? 8 : 1;
		if (setEndAt) setEnd(new Date(roundHour(setEndAt.getTime()) + move * mul));
		else if (setStartAt) setStart(new Date(roundHour(setStartAt.getTime()) + move * mul));
	});

	useEventListener('action+cycleSource', () => {
		const modSrc = useEventsState.getState().modifySourceId;
		const idx = sources.findIndex((s) => s.source.id === modSrc);
		if (idx < 0) return setModifySource(sources.at(0)?.source.id || null);
		const nxt = sources[(idx + 1) % sources.length];
		setModifySource(nxt.source.id);
	});

	if (plotId == null || feidId == null || !start)
		return <div style={{ color: color('red') }}>ERROR: plotted event not found</div>;

	const cycle = (which: 'onset_type' | 's_confidence', dir: -1 | 1) => {
		const column = columns.find((c) => c.sql_name === which) as StaticColumn;
		const opts = column.enum!.concat(which === 'onset_type' ? ([null] as any) : []);
		const value = opts[(opts.length + opts.indexOf(feid[which] as any) + dir) % opts.length];
		makeChange('feid', { column: column.sql_name, value, id: feidId, fast: true });
	};

	const foundFlr = sources.find((s) => s.erupt?.flr_start?.getTime() === feid.flr_time?.getTime());
	const foundCme = sources.find((s) => s.erupt?.cme_time?.getTime() === feid.cme_time?.getTime());

	return (
		<div className="flex flex-col h-full p-[2px] text-center text-sm overflow-y-scroll">
			<div className="flex flex-wrap ">
				<div className="relative w-[140px] h-[26px] pt-[2px]">
					<CoverageControls date={start} />
				</div>
				<div className="flex grow max-w-[163px] text-white gap-0.5 pb-[2px]">
					{(isIdle || isInsert) && (
						<Button variant="default" className="grow" onClick={isInsert ? handleEnter : toggle('insert')}>
							Insert
						</Button>
					)}
					{(isIdle || isMove) && (
						<Button variant="default" className="grow" onClick={isMove ? handleEnter : toggle('move')}>
							Move
						</Button>
					)}
					{!isIdle && (
						<Button variant="default" className="grow" onClick={escape}>
							Cancel
						</Button>
					)}
				</div>
			</div>
			<table className="[&_td]:border whitespace-nowrap max-w-80">
				<tbody>
					<tr className="h-[23px]">
						<td className={cn('w-[64px]', !isIdle && 'text-magenta')}>
							{setEndAt ? 'SET END' : isInsert ? 'INSERT' : isMove ? 'MOVE' : isLink ? 'LINK' : 'VIEW'}
						</td>
						<td title="Event onset time" colSpan={2} className="text-dark">
							{prettyDate(start)}
						</td>
						<td title="Event duration in hours" className="w-[48px] text-dark">
							+{duration}
						</td>
					</tr>
					<tr className="h-[25px]">
						<td
							title="Event onset type"
							className={cn(feid.onset_type == null && 'text-dark')}
							onContextMenu={(e) => {
								e.stopPropagation();
								e.preventDefault();
								cycle('onset_type', -1);
							}}
							onClick={(e) => {
								e.stopPropagation();
								cycle('onset_type', 1);
							}}
							onWheel={(e) => cycle('onset_type', e.deltaY > 0 ? 1 : -1)}
						>
							<Button className="w-full">{feid.onset_type ? feid.onset_type : 'ons'}</Button>
						</td>
						<td className="w-[64px] pl-1" title="Source type number">
							stype
							<NumberInput
								className="w-10 ml-[6px]"
								value={feid.s_type}
								onChange={(value) => makeChange('feid', { id: feidId, column: 's_type', value, fast: true })}
							/>
							<span style={{ paddingLeft: 2, color: color('dark', 0.3) }}>(0)</span>
						</td>
						<td
							title="Source identification confidence"
							colSpan={2}
							onContextMenu={(e) => {
								e.stopPropagation();
								e.preventDefault();
								cycle('s_confidence', -1);
							}}
							onClick={(e) => {
								e.stopPropagation();
								cycle('s_confidence', 1);
							}}
							onWheel={(e) => cycle('s_confidence', e.deltaY > 0 ? 1 : -1)}
						>
							<Button className="w-[83px]">
								conf
								<span
									className={cn(
										'pl-1',
										{ low: 'text-orange', avg: 'text-text', high: 'text-green', none: 'text-red' }[
											feid.s_confidence ?? 'none'
										],
									)}
								>
									{feid.s_confidence ?? 'N/A'}
								</span>
							</Button>
						</td>
					</tr>
					{(feid.flr_time || feid.cme_time) && (
						<tr className="text-xs">
							<td colSpan={4}>
								<div className="flex justify-evenly">
									{feid.flr_time && (
										<div className={cn(foundFlr ? 'text-green' : 'text-red')}>
											flr {prettyDate(feid.flr_time).slice(5, 16)}
										</div>
									)}
									{feid.cme_time && (
										<div className={cn(foundCme ? 'text-green' : 'text-red')}>
											cme {prettyDate(feid.cme_time).slice(5, 16)}
										</div>
									)}
								</div>
							</td>
						</tr>
					)}
					<tr title="Source description">
						<td colSpan={4}>
							<TextInput
								className="w-full"
								value={feid.s_description ?? ''}
								onSubmit={(value) =>
									makeChange('feid', {
										id: feidId,
										column: 's_description',
										value: value || null,
									})
								}
							/>
						</td>
					</tr>
					<tr title="General notes">
						<td colSpan={4}>
							<TextInput
								className="w-full"
								value={feid.comment ?? ''}
								onSubmit={(value) =>
									makeChange('feid', { id: feidId, column: 'comment', value: value || null })
								}
							/>
						</td>
					</tr>
				</tbody>
			</table>
			<SourcesList />
			<div className="grow"></div>
			<div className="text-right p-[1px] text-white">
				<Button variant="default" onClick={() => deleteFeid()}>
					Delete event
				</Button>
			</div>
		</div>
	);
}

export const InsertControls = {
	name: 'Insert Controls',
	Menu,
	Panel,
};
