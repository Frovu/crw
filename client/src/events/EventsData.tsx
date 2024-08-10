import { type ReactNode, useContext, useMemo, useState } from 'react';
import type { ChangeLog } from './events';
import { MainTableContext, SampleContext, TableViewContext, useEventsSettings, valueToString } from './events';
import { apiGet, apiPost, useEventListener } from '../util';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { type Sample, applySample, renderFilters, useSampleState } from './sample';
import { AuthContext, color, logError, logMessage, logSuccess } from '../app';
import { G_ALL_OPS, fromDesc, type ColumnDef, type DataRow, type Value } from './columns';
import { Confirmation } from '../Utility';
import { discardChange, resetChanges, setRawData, useEventsState } from './eventsState';

export function ExportMenu() {
	const { data: shownData, columns: allColumns, includeMarkers: inc } = useContext(TableViewContext);

	const columns = inc ? allColumns.concat({
		fullName: 'SAMPLE',
		type: 'text',
		description: 'Included in these samples (separated by ;)',
		width: 16
	} as any) : allColumns;
	
	const renderText = (format: 'json'|'csv'|'txt') => {
		const data = shownData.map((row, i) => !inc ? row.slice(1)
			: row.slice(1).concat(inc[i]));
		const cols = columns.map(({ fullName, type, description, enum: aenum }, i) => ({
			name: fullName, type, description, enum: aenum
		}));
		if (format === 'json') {
			return JSON.stringify({ columns: cols, data }, null, 2);
		} else if (format === 'txt') {
			let text = 'Note: plaintext export option has limitations and one should consider using JSON instead' +
				'\r\nAll whitespace in values is replaced by _, missing values are marked as N/A\r\n';
			text += columns.map(col => col.fullName.replace(/\s/g, '_').padStart(col.width, ' '.repeat(col.width))).join(' ') + '\r\n';
			for (const row of data) {
				for (const [i, col] of columns.entries()) {
					const v = row[i];
					const val = v instanceof Date ? v?.toISOString().replace(/\..+/,'Z') : v;
					text += (val == null ? 'N/A' : val).toString().replace(/\s/g, '_')
						.padStart(col.width + (i === 0 ? 0 : 4), ' '.repeat(col.width)) + ' ';
				}
				text += '\r\n';
			};
			return text;
		} else if (format === 'csv') {
			const head = columns.map(col => col.fullName).join(',');
			return [head].concat(data.map(row => row.map(v => valueToString(v)).join(','))).join('\r\n');
		}
		return '';
	};

	const doExport = (format: 'json'|'csv'|'txt', copy?: boolean) => () => {
		if (copy)
			return navigator.clipboard.writeText(renderText(format));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([renderText(format)]));
		a.download = `feid.${format}`;
		a.click();
	};

	return <div style={{ maxWidth: 240, padding: '2px 8px' }}>
		<button className='TextButton' onClick={doExport('json')}>Download json</button>
		<button className='TextButton' onClick={doExport('txt')}>Download txt</button>
		<button className='TextButton' onClick={doExport('csv')}>Download csv</button>
		<button className='TextButton' onClick={doExport('csv', true)}>Copy csv to clipboard</button>
		<div className='separator' style={{ margin: '6px 0' }}></div>
		<div style={{ color: 'var(--color-text-dark)', fontSize: 12 }}>
			Note that table is exported as it is currently visible:
			respecting selected sample, filters and enabled columns</div>
	</div>;
}

export default function EventsDataProvider({ children }: { children: ReactNode }) {
	const { login } = useContext(AuthContext);
	// ************************************************************************************
	// 								  MAIN TABLE STRUCTURE
	// ************************************************************************************

	const structureQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableStructure'],
		queryFn: async () => {
			const { tables, series } = await apiGet<{
				tables: { [name: string]: { [name: string]: ColumnDef } },
				series: { [s: string]: string }
			}>('events/info');

			const structure = Object.fromEntries(Object.entries(tables).map(([table, cols]) =>
				[table, Object.values(cols).map(desc => fromDesc(desc))]));
			const columns = structure.feid;
			console.log('%cavailable columns:', 'color: #0f0' , structure);
			return {
				rels: {
					'FE': 'Forbush Effects',
					'MC': 'Magnetic Clouds',
					'FLR': 'Flares',
					'CME': 'Coronal Mass Ejections',
				},
				structure,
				columns,
				series
			};
		}
	});

	// ************************************************************************************
	// 								  MAIN TABLE DATA
	// ************************************************************************************

	const columnOrder = useEventsSettings(st => st.columnOrder);
	const dataQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		keepPreviousData: true,
		queryKey: ['tableData'], 
		queryFn: () => apiGet<{ data: Value[][], fields: string[], changelog?: ChangeLog }>('events', { changelog: true }),
		onSuccess: () => logMessage('Events table loaded', 'debug')
	});
	
	const mainContext = useMemo(() => {
		if (!dataQuery.data || !structureQuery.data) return null;
		const { columns, rels, series, structure } = structureQuery.data;
		const { data: rawData, fields, changelog } = dataQuery.data;

		const cols = columns.slice(1);
		const filtered = [columns[0]].concat((() => {
			if (columnOrder == null) {
				const sorted = cols.sort((a, b) => a.generic ? a.name?.localeCompare(b.name) : 0)
					.sort((a, b) => G_ALL_OPS.indexOf(a.generic?.params.operation as any) - G_ALL_OPS.indexOf(b.generic?.params.operation as any));
				const magnIdx = sorted.findIndex(col => col.entity === 'forbush_effects' && col.name === 'magnitude');
				const insIdx = sorted.findIndex(col => col.entity === 'forbush_effects' && col.name === 'ons type');
				if (magnIdx > 0)
					sorted.splice(insIdx + 1, 0, sorted.splice(magnIdx, 1)[0]);
				return sorted;
			} else {  // place new columns at the end
				const index = (id: string) => { const idx = columnOrder.indexOf(id); return idx < 0 ? 9999 : idx; };
				return cols.sort((a, b) => index(a.id) - index(b.id));
			}
		})())
			.sort((a, b) => Object.keys(rels).indexOf(a.rel ?? '') - Object.keys(rels).indexOf(b.rel ?? ''))
			.filter(c => fields.includes(c.id));

		const indexes = filtered.map(c => fields.indexOf(c.id));
		const data = rawData.map((row: Value[]) => indexes.map((i) => row[i])) as DataRow[];
		for (const [i, col] of Object.values(filtered).entries()) {
			if (col.type === 'time') {
				for (const row of data) {
					if (row[i] === null) continue;
					const date = new Date((row[i] as number) * 1e3);
					row[i] = isNaN(date.getTime()) ? null : date;
				}
			}
		}

		const columnIndex = Object.fromEntries(filtered.map((c, i) => [c.id, i]));

		setRawData('feid', data, filtered);

		console.log('%crendered table:', 'color: #0f0', columns, fields, data, changelog);
		return {
			
			columns: filtered,
			columnIndex,
			structure: { ...structure, feid: filtered },
			changelog,
			rels,
			series
		} as const;
	}, [columnOrder, dataQuery.data, structureQuery.data]);

	// ************************************************************************************
	// 										CHANGES
	// ************************************************************************************
	
	const [showCommit, setShowCommit] = useState(false);
	const created = useEventsState(state => state.created);
	const deleted = useEventsState(state => state.deleted);
	const changes = useEventsState(state => state.changes);
	const data    = useEventsState(state => state.data);
	const rawData = useEventsState(state => state.rawData);
	const columns = useEventsState(state => state.columns);
	const totalChanges = Object.values(changes).reduce((a, b) => a + b.length, 0);

	useEventListener('action+commitChanges', () => setShowCommit(totalChanges > 0));
	useEventListener('action+discardChanges', () => resetChanges(false));

	const queryClient = useQueryClient();
	const { mutate: doCommit, error } = useMutation(() => apiPost('events/changes', {
		enities: (Object.keys(changes) as (keyof typeof changes)[]).map(tbl =>
			({ changes: changes[tbl], created: created[tbl], deleted: deleted[tbl] }))
	}), {
		onError: e => { logError('Failed submiting: '+e?.toString()); },
		onSuccess: () => {
			queryClient.invalidateQueries('tableData');
			logSuccess('Changes commited!');
			setShowCommit(false);
			resetChanges(true);
		}
	});

	// ************************************************************************************
	// 										SAMPLE
	// ************************************************************************************

	const filters = useSampleState(state => state.filters);
	const sample = useSampleState(state => state.current);
	const isPicking = useSampleState(state => state.isPicking);

	const samplesQuery = useQuery('samples', async () => {
		const { samples } = await apiGet<{ samples: Sample[] }>('events/samples');
		for (const smpl of samples)
			for (const k of ['created', 'modified'] as const)
				smpl[k] = smpl[k] && new Date(smpl[k]);
		console.log('%cavailable samples:', 'color: #0f0', samples);
		return samples;
	});

	const sampleContext = useMemo(() => {
		const samples = samplesQuery.data;
		if (!data.feid || !columns.feid || !samples)
			return null;
		const isOwn = (s: Sample) => s.authors.includes(login as any) ? -1 : 1;
		const sorted = samples.sort((a, b) => b.modified.getTime() - a.modified.getTime())
			.sort((a, b) => isOwn(a) - isOwn(b));
		const dt = data.feid;
		const applied = isPicking ? dt.map(row => [...row]) as typeof dt : applySample(dt, sample, columns.feid, sorted);
		const filterFn = renderFilters(filters, columns.feid);
		const filtered = applied.filter(row => filterFn(row));
		return {
			data: filtered, 
			current: sample,
			samples: sorted,
		};
	}, [samplesQuery.data, data.feid, columns.feid, isPicking, sample, filters, login]);

	if (!mainContext || !data || !sampleContext || !structureQuery.data || !samplesQuery.data) {
		return <div style={{ padding: 8 }}>
			<div>{structureQuery.isLoading && 'Loading tables..'}</div>
			<div>{dataQuery.isLoading && 'Loading data...'}</div>
			<div>{samplesQuery.isLoading && 'Loading samples...'}</div>
			<div style={{ color: 'var(--color-red)' }}>
				<div>{structureQuery.error?.toString() ?? dataQuery.error?.toString() ?? samplesQuery.error?.toString()}</div>
			</div>
		</div>;
	}
	return (
		<MainTableContext.Provider value={mainContext}>
			<SampleContext.Provider value={sampleContext}>
				{mainContext && showCommit && <Confirmation
					callback={() => doCommit()} closeSelf={(yes) => !yes && setShowCommit(false)}>
					<h4 style={{ margin: '1em 0 0 0' }}>About to commit {totalChanges} change{totalChanges > 1 ? 's' : ''}</h4>
					<div style={{ textAlign: 'left', padding: '1em 2em 1em 2em' }} onClick={e => e.stopPropagation()}>
						{Object.entries(changes).map(([tbl, chgs]) => <div key={tbl}>
							{chgs.length > 0 && <div>{tbl}</div>}
							{chgs.filter(ch => !ch.silent).map(({ id, column: cId, value }) => {
								const column = columns[tbl as keyof typeof columns]?.find(c => c.id === cId);
								const row = rawData[tbl as keyof typeof changes]!.find(r => r[0] === id);
								const colIdx = columns[tbl as keyof typeof changes]!.findIndex(c => c.id === cId);
								const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
								const val1 = value == null ? 'null' : valueToString(value);
								return (<div key={id+cId+value}>
									<span style={{ color: color('text-dark') }}>#{id}: </span>
									<i style={{ color: color('active') }}>{column?.fullName}</i> {val0} -&gt; <b>{val1}</b>
									<div className='CloseButton' style={{ transform: 'translate(4px, 2px)' }}
										onClick={() => discardChange(tbl as any, { id, column: cId, value })}/>
								</div>);})}
						</div>)}
					</div>
					{(error as any) && <div style={{ color: color('red') }}>{(error as any).toString()}</div>}
				</Confirmation>}
				{children}
			</SampleContext.Provider>
		</MainTableContext.Provider>
	);

}