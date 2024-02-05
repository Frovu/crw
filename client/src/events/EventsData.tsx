import { type ReactNode, useContext, useMemo, useState } from 'react';
import type { ChangeLog, ChangeValue, ColumnDef, DataRow, Value } from './events';
import { MainTableContext, SampleContext, TableViewContext, equalValues, useEventsSettings, valueToString } from './events';
import { apiGet, apiPost, useEventListener } from '../util';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { type Sample, applySample, renderFilters, useSampleState } from './sample';
import { AuthContext, logError, logMessage, logSuccess } from '../app';
import { G_ALL_OPS } from './columns';
import { Confirmation } from '../Utility';

export function ExportMenu() {
	const { tables } = useContext(MainTableContext);
	const { data: shownData, columns } = useContext(TableViewContext);
	
	const renderText = (format: 'json'|'csv'|'txt') => {
		const data = shownData.map(row => row.slice(1));
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
		a.download = `${tables[0]}.${format}`;
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

	const firstTable = 'forbush_effects'; // FIXME: actually this is weird stuff
	const structureQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableStructure'],
		queryFn: async () => {
			const { tables, series } = await apiGet<{
				tables: { [name: string]: { [name: string]: ColumnDef } },
				series: { [s: string]: string }
			}>('events/info');

			const columns = Object.entries(tables).flatMap(([table, cols]) => Object.entries(cols).map(([sqlName, desc]) => {
				const width = (()=>{
					switch (desc.type) {
						case 'enum': return Math.max(5, ...(desc.enum!.map(el => el.length)));
						case 'time': return 17;
						case 'text': return 14;
						default: return 6; 
					}
				})();
				const shortTable = table.replace(/([a-z])[a-z ]+_?/gi, '$1');
				const fullName = desc.name + (table !== firstTable ? ' of ' + shortTable.toUpperCase() : '');
				return {
					...desc, width, sqlName,
					entity: table,
					name: desc.name.length > 30 ? desc.name.slice(0, 30)+'..' : desc.name,
					fullName: fullName.length > 30 ? fullName.slice(0, 30)+'..' : fullName,
					description: desc.name.length > 20 ? (desc.description ? (fullName + '\n\n' + desc.description) : '') : desc.description
				} as ColumnDef;
			}) 	);
			console.log('%cavailable columns:', 'color: #0f0' , columns);
			return {
				tables: Object.keys(tables),
				columns: [ { id: 'id', hidden: true, entity: firstTable } as ColumnDef, ...columns],
				series: series
			};
		}
	});

	// ************************************************************************************
	// 								  MAIN TABLE DATA
	// ************************************************************************************

	const columnOrder = useEventsSettings(st => st.columnOrder);
	const [showCommit, setShowCommit] = useState(false);
	const [changes, setChanges] = useState<ChangeValue[]>([]);
	const dataQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		keepPreviousData: true,
		queryKey: ['tableData'], 
		queryFn: () => apiGet<{ data: Value[][], fields: string[], changelog?: ChangeLog }>('events', { changelog: true }),
		onSuccess: () => logMessage('Events table loaded', 'debug')
	});
	const rawMainContext = useMemo(() => {
		if (!dataQuery.data || !structureQuery.data) return null;
		const { columns, tables, series } = structureQuery.data;
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
			.sort((a, b) => tables.indexOf(a.entity) - tables.indexOf(b.entity))
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
		console.log('%crendered table:', 'color: #0f0', fields, data, changelog);
		return {
			data,
			columns: filtered,
			changelog,
			firstTable,
			tables: Array.from(tables),
			series
		} as const;
	}, [columnOrder, dataQuery.data, structureQuery.data]);

	// ************************************************************************************
	// 						 	  MAIN TABLE DATA WITH CHANGES
	// ************************************************************************************

	const mainContext = useMemo(() => {
		if (!rawMainContext) return null;
		const { data: rawData, columns } = rawMainContext;
		const data = [...rawData.map(r => [...r])] as typeof rawData;
		for (const { id, column, value } of changes) {
			const row = data.find(r => r[0] === id);
			const columnIdx = columns.findIndex(c => c.id === column.id);
			if (row) row[columnIdx] = value;
		}
		const sortIdx = columns.findIndex(c => c.name === 'time');
		if (sortIdx > 0) data.sort((a: any, b: any) => a[sortIdx] - b[sortIdx]);
		
		return {
			...rawMainContext,
			data,
			changes,
			makeChange: ({ id, column, value }: ChangeValue) => {
				const row = rawData.find(r => r[0] === id);
				// FIXME: create entity if not exists
				const colIdx = columns.findIndex(c => c.id === column.id);
				const entityExists = row && columns.some((c, i) => c.entity === column.entity && row[i] != null);
				if (!entityExists) return false;

				setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id ),
					...(!equalValues(row[colIdx], value) ? [{ id, column, value }] : [])]);
				return true;
			}
		};
	}, [rawMainContext, changes]);
	
	useEventListener('action+commitChanges', () => setShowCommit(changes.length > 0));
	useEventListener('action+discardChanges', () => setChanges([]));

	const queryClient = useQueryClient();
	const { mutate: doCommit } = useMutation(() => apiPost('events/changes', {
		changes: changes.map(({ column, ...c }) => ({ ...c, entity: column.entity, column: column.sqlName }))
	}), {
		onError: e => { logError('Failed submiting: '+e?.toString()); },
		onSuccess: () => {
			queryClient.invalidateQueries('tableData');
			logSuccess('Changes commited!'); setShowCommit(false); setChanges([]); }
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
		const isOwn = (s: Sample) => s.authors.includes(login as any) ? -1 : 1;
		const sorted = samples.sort((a, b) => b.modified.getTime() - a.modified.getTime())
			.sort((a, b) => isOwn(a) - isOwn(b));
		console.log('%cavailable samples:', 'color: #0f0', sorted);
		return sorted;
	});

	const sampleContext = useMemo(() => {
		const samples = samplesQuery.data;
		if (!mainContext || !samples) return null;
		const { columns, data } = mainContext;
		const applied = isPicking ? data.map(row => [...row]) as typeof data : applySample(data, sample, columns);
		const filterFn = renderFilters(filters, columns);
		const filtered = applied.filter(row => filterFn(row));
		return {
			data: filtered, 
			current: sample,
			samples,
		};
	}, [filters, isPicking, mainContext, sample, samplesQuery.data]);

	if (!mainContext || !sampleContext || !structureQuery.data || !dataQuery.data || !samplesQuery.data) {
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
				{rawMainContext && showCommit && <Confirmation
					callback={() => doCommit()} closeSelf={() => setShowCommit(false)}>
					<h4 style={{ margin: '1em 0 0 0' }}>About to commit {changes.length} change{changes.length > 1 ? 's' : ''}</h4>
					<div style={{ textAlign: 'left', padding: '1em 2em 1em 2em' }} onClick={e => e.stopPropagation()}>
						{changes.map(({ id, column, value }) => {
							const row = rawMainContext.data.find(r => r[0] === id);
							const colIdx = rawMainContext.columns.findIndex(c => c.id === column.id);
							const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
							const val1 = value == null ? 'null' : valueToString(value);
							return (<div key={id+column.id+value}>
								<span style={{ color: 'var(--color-text-dark)' }}>#{id}: </span>
								<i style={{ color: 'var(--color-active)' }}>{column.fullName}</i> {val0} -&gt; <b>{val1}</b>
								<div className='CloseButton' style={{ transform: 'translate(4px, 2px)' }} onClick={() => 
									setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id)])}/>
							</div>);})}
					</div>
				</Confirmation>}
				{children}
			</SampleContext.Provider>
		</MainTableContext.Provider>
	);

}