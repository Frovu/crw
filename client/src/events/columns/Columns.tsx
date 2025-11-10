import { Fragment, useContext, useEffect, useState } from 'react';
import { apiPost, useEventListener } from '../../util';
import { MainTableContext, SampleContext, findColumn, useEventsSettings } from '../core/eventsSettings';
import { color } from '../../plots/plotUtil';
import { AuthContext, logError, logMessage, logSuccess } from '../../app';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Confirmation } from '../../Utility';
import { SW_TYPES } from '../../plots/time/SWTypes';

export default function ColumnsSelector() {
	return null;
	const queryClient = useQueryClient();
	const { role } = useContext(AuthContext);
	const { shownColumns, columnOrder, setColumnOrder, setColumns } = useEventsSettings();
	const { samples } = useContext(SampleContext);
	const { rels, columns, structure, series: seriesOpts } = useContext(MainTableContext);
	const [action, setAction] = useState(true);
	const [dragging, setDragging] = useState<null | { y: number; id: string; pos: number }>(null);
	const [open, setOpen] = useState(false);
	const [report, setReport] = useState<{ error?: string; success?: string }>({});
	const genericSate = useGenericState();
	const {
		params,
		id: gid,
		nickname,
		description: desc,
		setGeneric,
		set,
		reset,
		setParam,
		setPoint,
		setPointHours,
		setPointSeries,
		setPointStruct,
	} = genericSate;
	const { operation } = params;

	useEffect(() => {
		if (shownColumns && columnOrder) return;
		const cols = [
			'time',
			'duration',
			'magnitude',
			'src info',
			'V max',
			'B max',
			'VmBm',
			'Bz min',
			'Dst min',
			'dA0 min',
			'Axy max',
			'Az range',
			'tm A0 min',
			'Kp max',
			'Ap max',
			'ons type',
			'src type',
			'src conf',
		]
			.map((name) => findColumn(columns, name)?.id)
			.filter((c): c is string => c as any);
		if (!shownColumns) setColumns(() => cols);
		if (!columnOrder) setColumnOrder(cols);
	}, [setColumns, columns, shownColumns, columnOrder, setColumnOrder]);

	const newOrder = columns.map((c) => c.id);
	if (dragging) newOrder.splice(dragging.pos, 0, newOrder.splice(newOrder.indexOf(dragging.id), 1)[0]);
	const sortedColumns = columns.slice().sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));

	const [samplesDepend, setSamplesDepend] = useState<string[]>([]);
	useEventListener('click', () => setSamplesDepend([]));
	useEventListener('escape', () => setSamplesDepend([]));

	useEffect(() => {
		if (gid == null) setReport({});
	}, [gid]);
	useEffect(() => {
		if (open) reset();
		setReport({});
	}, [reset, open]);
	useEffect(() => {
		if (!report.error && !report.success) return;
		const timeout = setTimeout(() => setReport({}), 5_000);
		return () => clearTimeout(timeout);
	}, [report]);

	const oriColumn = gid == null ? null : columns.find((c) => c.generic?.id === gid);
	const original = oriColumn && oriColumn.generic;
	const paramsChanged = original && JSON.stringify(original.params) !== JSON.stringify(params);
	const smhChanged =
		original &&
		(paramsChanged || genericSate.is_public !== original.is_public || desc !== original.description || nickname !== original.nickname);
	const withDuration = ['FE', 'MC'];
	const isClone = operation === 'clone_column',
		isCombine = G_COMBINE_OP.includes(operation as any),
		isValue = G_VALUE_OP.includes(operation as any);
	const isTime = operation?.startsWith('time_offset');
	const isSrcCol = G_OP_SRC.includes(operation as any);
	const isSrcCount = operation === 'source_count';

	const isValid =
		(isClone && params.column) ||
		(isCombine && params.column && params.other_column) ||
		(isValue && (params.series || isTime)) ||
		(isSrcCol && params.target_entity && params.influence?.length && (params.target_column || isSrcCount));

	const columnOpts = !isClone && !isCombine ? null : columns.filter((c) => !c.hidden).map(({ id, fullName }) => [id, fullName]);

	const srcColTargetOpts = operation === 'source_value' && structure[params.target_entity as any]?.map((col) => [col.id, col.name]);

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openColumnsSelector', () => setOpen((o) => !o));
	const check = (id: string, val: boolean) => setColumns((cols) => (val ? cols.concat(id) : cols.filter((c) => c !== id)));

	const { mutate: computeAll } = useMutation({
		mutationFn: () => apiPost<{ time: number; done: boolean; error?: string }>('events/compute_all'),
		onMutate: () => {
			logMessage('Computing everything...', 'debug');
		},
		onSuccess: ({ time, done, error }) => {
			if (!done) {
				setTimeout(() => computeAll(), 1000);
				return;
			}
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess(`Computed everything in ${time} s`);
			if (error) logError(error);
		},
		onError: (err: any) => {
			setReport({ error: err.toString() });
			logError('compute all: ' + err.toString());
		},
	});

	const { mutate: computeRow } = useMutation({
		mutationFn: (rowId: number) => apiPost<{ time: number; done: boolean; error?: string }>('events/compute_row', { id: rowId }),
		onMutate: (rowId) => {
			logMessage('Computing row #' + rowId.toString(), 'debug');
		},
		onSuccess: ({ time, done, error }, rowId) => {
			if (!done) {
				setTimeout(() => computeRow(rowId), 1000);
				return;
			}
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess(`Computed row #${rowId} in ${time} s`);
			if (error) logError(error);
		},
		onError: (err: any, rowId) => {
			setReport({ error: err.toString() });
			logError(`compute row #${rowId}: ` + err.toString());
		},
	});

	const { mutate: computeColumn, isPending: loadingCompute } = useMutation({
		mutationFn: (column: ColumnDef) => apiPost<{ time: number }>('events/compute', { id: column.id }),
		onMutate: (column) => {
			logMessage('Computing ' + column.fullName, 'debug');
		},
		onSuccess: ({ time }, column) => {
			setReport({ success: `Done in ${time} s` });
			logSuccess(`Computed ${column.fullName} in ${time} s`);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
		},
		onError: (err: any, column) => {
			setReport({ error: err.toString() });
			logError(`compute ${column.fullName}: ` + err.toString());
		},
	});

	useEventListener('computeRow', (e: CustomEvent<{ id: number }>) => computeRow(e.detail.id));
	useEventListener('computeAll', () => computeAll());
	useEventListener('computeColumn', (e: CustomEvent<{ column: ColumnDef }>) => computeColumn(e.detail.column));

	const { mutate: deleteGeneric, isPending: loadingDelete } = useMutation({
		mutationFn: (genericId: number) => apiPost<{ time: number }>('events/generics/remove', { id: genericId }),
		onSuccess: ({ time }, genericId) => {
			if (genericId === gid) reset();
			const col = columns.find((c) => c.generic?.id === genericId);
			queryClient.invalidateQueries({ queryKey: ['Tables'] });
			logSuccess(`Deleted column ${col?.fullName ?? genericId}`);
		},
		onError: (err: any, genericId) => {
			const col = columns.find((c) => c.generic?.id === genericId);
			logError(`delete g#${genericId}(${col?.fullName}): ` + err.toString());
		},
	});

	const { mutate: mutateGeneric, isPending: loadingMutate } = useMutation({
		mutationFn: (createNew: boolean) =>
			apiPost<{ generic: GenericColumn; name: string; time: number }>('events/generics', {
				...genericSate,
				gid: createNew ? undefined : gid,
			}),
		onSuccess: ({ generic, name, time }) => {
			queryClient.invalidateQueries({ queryKey: ['Tables'] });
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			setGeneric(generic);
			setReport({ success: `Done in ${time} s` });
			if (!shownColumns?.includes(name)) setColumns((cols) => cols.concat(name));
			logSuccess(`${gid ? 'Modified' : 'Created'} generic ${oriColumn?.fullName ?? generic.nickname ?? generic.id} in ${time} s`);
		},
		onError: (err: any) => {
			setReport({ error: err.toString() });
			logError('generic: ' + err.toString());
		},
	});
	const isLoading = loadingCompute || loadingDelete || loadingMutate;

	type SelectProps<T> = {
		txt: string;
		title?: string;
		k: T extends T ? keyof T : never;
		opts: string[][];
	};
	const Select = <T extends GenericParams>({ txt, k, opts, title }: SelectProps<T>) => (
		<div title={title}>
			{txt}:
			<select
				className="Borderless"
				style={!opts.find((o) => o[0] === (params as T)[k]) ? { color: color('text-dark') } : {}}
				value={((params as T)[k] as any) || 'null'}
				onChange={(e) => setParam(k, e.target.value === 'null' ? undefined : (e.target.value as any))}
			>
				<option value="null">-- None --</option>
				{opts.map(([val, pretty]) => (
					<option key={val} value={val}>
						{pretty}
					</option>
				))}
			</select>
		</div>
	);
	const RefInput = ({ k }: { k: 'boundary' | 'reference' }) => {
		const st = params[k];
		const isEvent = st?.type === 'event';
		const isSWS = st?.type === 'sw_structure';
		const isDefault =
			isEvent &&
			!(Object.keys(defaultRefPoint) as (keyof RefPointEvent)[]).some((p) => st[p] !== defaultRefPoint[p]) &&
			st.end !== (k === 'reference' ? true : false);
		return (
			<>
				<select
					style={{ color: isDefault ? color('text-dark') : 'unset', width: isEvent ? '16ch' : isSWS ? '10ch' : '7.5ch' }}
					className="Borderless"
					value={isEvent ? refToStr(st) : isSWS ? swRefToStr(st) : st?.operation}
					onChange={(e) => setPoint(k, e.target.value)}
				>
					<option value="null" disabled>
						-- None --
					</option>
					{EXTREMUM_OP.map((ext) => (
						<option key={ext} value={ext}>
							{ext.startsWith('abs_') ? `|${ext.slice(4)}|` : ext}
						</option>
					))}
					{Object.keys(rels)
						.flatMap((rel, i) =>
							(i > 0 ? [0] : [0, -1, 1]).flatMap((events_offset) =>
								(i === 0 || withDuration.includes(rel) ? [false, true] : [undefined]).map((end) =>
									[false, true].map((p) => refToStr({ time_src: rel, events_offset, end }, p))
								)
							)
						)
						.map(([str, pretty]) => (
							<option key={str} value={str}>
								{pretty}
							</option>
						))}
					{[false, true].map((end) => (
						<option key={swRefToStr({ end })} value={swRefToStr({ end })}>
							{swRefToStr({ end }, true)}
						</option>
					))}
				</select>
				{st?.type === 'extremum' && (
					<select
						className="Borderless"
						style={{ width: '10ch' }}
						value={st.series}
						onChange={(e) => setPointSeries(k, e.target.value)}
					>
						{Object.entries(seriesOpts).map(([ser, pretty]) => (
							<option key={ser} value={ser}>
								{pretty}
							</option>
						))}
					</select>
				)}
				{st?.type === 'sw_structure' && (
					<select
						className="Borderless"
						style={{ width: '7.5ch' }}
						value={st.structure}
						onChange={(e) => setPointStruct(k, e.target.value)}
					>
						{SW_TYPES.map((typ) => (
							<option key={typ} value={typ}>
								{typ}
							</option>
						))}
					</select>
				)}
				<label title="Offset in hours" style={{ paddingLeft: 2, color: st?.hours_offset === 0 ? color('text-dark') : 'inherit' }}>
					+
					<input
						style={{ margin: '0 2px', width: '6ch' }}
						type="number"
						min={-48}
						max={48}
						step={1}
						value={st?.hours_offset ?? 0}
						onChange={(e) => setPointHours(k, e.target.valueAsNumber)}
					/>
					h
				</label>
			</>
		);
	};
	return !open ? null : (
		<>
			{samplesDepend.length > 0 && (
				<Confirmation closeSelf={() => setSamplesDepend([])} callback={() => {}}>
					<h4>Can't remove column</h4>
					The following samples depend on it:
					<pre>{samplesDepend.join('/n')}</pre>
				</Confirmation>
			)}
			<div
				className="PopupBackground"
				onClick={() => setOpen(false)}
				onContextMenu={(e) => {
					setOpen(false);
					e.stopPropagation();
					e.preventDefault();
				}}
			/>
			<div
				className="Popup ColumnsSelector"
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				onMouseUp={() => setDragging(null)}
				onMouseLeave={() => setDragging(null)}
			>
				{Object.keys(rels).map((rel) => (
					<Fragment key={rel}>
						<button
							className="TextButton"
							onClick={() =>
								setColumns((cols) => [
									...cols.filter((c) => columns.find((cc) => cc.id === c)?.rel !== rel),
									...(!columns.find((cc) => cc.rel === rel && cols.includes(cc.id))
										? columns.filter((c) => c.rel === rel).map((c) => c.id)
										: []),
								])
							}
						>
							<b>
								<u>{rels[rel]}</u>
							</b>
						</button>
						{sortedColumns
							.filter((c) => !c.hidden && c.rel === rel)
							.map(({ id, name, description, generic }) => (
								<div
									key={id}
									style={{
										color: generic && !generic?.is_public ? color('text-dark') : color('text'),
										cursor: 'pointer',
									}}
									title={description}
								>
									<button
										className="TextButton"
										style={{ flex: 1, textAlign: 'left', lineHeight: '1.1em', wordBreak: 'break-all' }}
										onMouseEnter={(e) => {
											if ((e.shiftKey || e.ctrlKey) && e.buttons === 1) return check(id, action);
											setDragging((dr) => dr && { ...dr, pos: newOrder.indexOf(id) });
										}}
										onMouseDown={(e) => {
											if (e.button !== 0) return role && generic && setGeneric(generic);
											if (!e.shiftKey && !e.ctrlKey)
												return setDragging({ y: e.clientY, id, pos: newOrder.indexOf(id) });
											const chk = !shownColumns?.includes(id);
											setAction(chk);
											check(id, chk);
										}}
										onMouseUp={(e) => {
											e.stopPropagation();
											if (!dragging || Math.abs(e.clientY - dragging.y) < 4) {
												if (e.button === 0 && !e.shiftKey && !e.ctrlKey) check(id, !shownColumns?.includes(id));
											} else {
												setColumnOrder(newOrder);
											}
											setDragging(null);
										}}
									>
										<input type="checkbox" style={{ marginRight: 8 }} checked={!!shownColumns?.includes(id)} readOnly />
										{name}
									</button>
									{role && generic && (
										<button
											style={{ fontSize: 16, height: 16, lineHeight: '16px', margin: '0 2px 4px 2px' }}
											title="Edit or clone column (RMB)"
											className="TextButton"
											onClick={() => setGeneric(generic)}
										>
											e
										</button>
									)}
									{generic?.is_own && (
										<div
											className="CloseButton"
											onClick={(e) => {
												const dep = samples.filter((smpl) => smpl.filters?.find(({ column }) => column === id));
												console.log('dependent samples', dep);
												e.stopPropagation();
												if (dep.length > 0) setSamplesDepend(dep.map((s) => s.name));
												else deleteGeneric(generic.id);
											}}
										/>
									)}
								</div>
							))}
					</Fragment>
				))}
				{role && (
					<div className="GenericsControls" onClick={(e) => e.stopPropagation()}>
						<h4 style={{ margin: 0, padding: '4px 0 8px 0', cursor: 'pointer' }} title="Reset" onMouseDown={() => reset()}>
							Manage custom columns:
						</h4>
						{(original || isValid) && (
							<label title="Display name for the column (optional)">
								Name:
								<input
									type="text"
									style={{ width: '11em', marginLeft: 4 }}
									placeholder={oriColumn?.fullName}
									value={nickname ?? ''}
									onChange={(e) => set('nickname', e.target.value || null)}
								/>
							</label>
						)}
						{(original || isValid) && (
							<label title="Column description (optional)" style={{ paddingBottom: 4 }}>
								Desc:
								<input
									type="text"
									style={{ width: '11em', marginLeft: 4 }}
									placeholder={oriColumn?.description}
									value={desc ?? ''}
									onChange={(e) => set('description', e.target.value)}
								/>
							</label>
						)}
						<Select txt="Type" k="operation" opts={G_ALL_OPS.map((t) => [t, t])} />
						{(isClone || isCombine) && <Select txt="Column" k="column" opts={columnOpts!} />}
						{isCombine && <Select txt="Column" k="other_column" opts={columnOpts!} />}
						{isClone && (
							<label>
								Offset, events:
								<input
									style={{ width: 48, margin: '0 4px' }}
									type="number"
									step={1}
									min={-2}
									max={2}
									value={params.events_offset}
									onChange={(e) => setParam('events_offset', e.target.valueAsNumber)}
								/>
							</label>
						)}
						{isValue && (
							<>
								{!isTime && <Select txt="Series" k="series" opts={Object.entries(seriesOpts)} />}
								<div style={{ minWidth: 278, paddingTop: 4 }}>
									From
									<RefInput k="reference" />
								</div>
								<div style={{ minWidth: 278 }}>
									To
									<RefInput k="boundary" />
								</div>
							</>
						)}
						{isSrcCol && <Select txt="Entity" k="target_entity" opts={Object.entries(G_SRC_ENTITY_NAME)} />}
						{srcColTargetOpts && <Select txt="Column" k="target_column" opts={srcColTargetOpts} />}
						{isSrcCol && !isSrcCount && (
							<Select
								txt="Order"
								title="How to order sources of each event to select the desired one"
								k="order_by"
								opts={G_SRC_ORDER_OPTIONS.map((op) => [op, op])}
							/>
						)}
						{isSrcCol && (
							<div className="flex flex-col !items-end">
								{INFLUENCE_OPTIONS.map((infl) => (
									<label
										key={infl}
										title={'Include sources with cr_influence=' + infl}
										className={!params.influence?.includes(infl) ? 'text-text-dark' : ''}
									>
										{infl}
										<input
											className="ml-1"
											type="checkbox"
											checked={!!params.influence?.includes(infl)}
											onChange={(e) =>
												setParam(
													'influence',
													e.target.checked
														? [...new Set([...(params.influence ?? []), infl])]
														: params.influence?.filter((i) => i !== infl) ?? []
												)
											}
										/>
									</label>
								))}
							</div>
						)}
						{(original || isValid) && (
							<label title="Should other users be able to see this column?">
								public column
								<input
									className="ml-1 h-6"
									type="checkbox"
									checked={!!genericSate.is_public}
									onChange={(e) => set('is_public', e.target.checked)}
								/>
							</label>
						)}
						{oriColumn && !paramsChanged && (
							<div style={{ paddingLeft: '5em', wordBreak: 'break-word' }}>
								<button style={{ width: '14em' }} disabled={isLoading} onClick={() => computeColumn(oriColumn)}>
									Compute {oriColumn.fullName}
								</button>
							</div>
						)}
						{smhChanged && (
							<div style={{ paddingLeft: '5em', wordBreak: 'break-word' }}>
								<button style={{ width: '14em' }} disabled={isLoading} onClick={() => mutateGeneric(false)}>
									Modify {oriColumn.fullName}
								</button>
							</div>
						)}
						{(!original || (paramsChanged && (nickname == null || nickname !== original.nickname))) && isValid && (
							<div style={{ paddingLeft: '5em' }}>
								<button style={{ width: '14em' }} disabled={isLoading} onClick={() => mutateGeneric(true)}>
									Create {original ? 'new' : ''} column
								</button>
							</div>
						)}
						{report.error && (
							<div
								style={{ color: color('red'), paddingLeft: 8, justifyContent: 'left', paddingTop: 4 }}
								onClick={() => setReport({})}
							>
								{report.error}
							</div>
						)}
						{report.success && (
							<div
								style={{ color: color('green'), paddingLeft: 8, justifyContent: 'left', paddingTop: 4 }}
								onClick={() => setReport({})}
							>
								{report.success}
							</div>
						)}
					</div>
				)}
				<div className="CloseButton" style={{ position: 'absolute', top: 2, right: 4 }} onClick={() => setOpen(false)} />
			</div>
		</>
	);
}
