import { ReactNode, useMemo, useState } from 'react';
import { ChangeLog, ChangeValue, ColumnDef, MainTableContext, SampleContext, Value, equalValues, useEventsSettings, valueToString } from './events';
import { apiGet, apiPost, useEventListener, useMutationHandler } from '../util';
import { useQuery } from 'react-query';
import { Sample, applySample, renderFilters, useSampleState } from './sample';
import { ConfirmationPopup } from './TableMenu';

export default function EventsDataProvider({ children }: { children: ReactNode }) {
	const { showChangelog, reset } = useEventsSettings();

	useEventListener('resetSettings', reset);

	// ************************************************************************************
	// 								  MAIN TABLE STRUCTURE
	// ************************************************************************************

	const firstTable = 'forbush_effects'; // FIXME: actually this is weird stuff
	const structureQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['mainTableStructure'],
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
					...desc, table, width, sqlName,
					name: desc.name.length > 20 ? desc.name.slice(0, 20)+'..' : desc.name,
					fullName: fullName.length > 30 ? fullName.slice(0, 30)+'..' : fullName,
					description: desc.name.length > 20 ? (desc.description ? (fullName + '\n\n' + desc.description) : '') : desc.description
				} as ColumnDef;
			}) 	);
			console.log('%cavailable columns:', 'color: #0f0' , columns);
			return {
				tables: Object.keys(tables),
				columns: [ { id: 'id', hidden: true, table: firstTable } as ColumnDef, ...columns],
				series: series
			};
		}
	});

	// ************************************************************************************
	// 								  MAIN TABLE DATA
	// ************************************************************************************

	const [showCommit, setShowCommit] = useState(false);
	const [changes, setChanges] = useState<ChangeValue[]>([]);
	const dataQuery = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableData', showChangelog], 
		queryFn: () => apiGet<{ data: Value[][], fields: string[], changelog?: ChangeLog }>('events', { changelog: showChangelog })
	});
	const rawMainContext = useMemo(() => {
		if (!dataQuery.data || !structureQuery.data) return null;
		const { columns, tables, series } = structureQuery.data;
		const { data: rawData, fields, changelog } = dataQuery.data;
		const filtered = columns.filter(c => fields.includes(c.id));
		const indexes = filtered.map(c => fields.indexOf(c.id));
		const data = rawData.map((row: Value[]) => indexes.map((i) => row[i]));
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
	}, [dataQuery.data, structureQuery.data]);

	// ************************************************************************************
	// 						 	  MAIN TABLE DATA WITH CHANGES
	// ************************************************************************************

	const mainContext = useMemo(() => {
		if (!rawMainContext) return null;
		const { data: rawData, columns } = rawMainContext;
		const data = [...rawData.map(r => [...r])];
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
				const entityExists = row && columns.some((c, i) => c.table === column.table && row[i] != null);
				if (!entityExists) return false;
				
				setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id ),
					...(!equalValues(row[colIdx], value) ? [{ id, column, value }] : [])]);
				return true;
			}
		};
	}, [rawMainContext, changes]);

	useEventListener('action+commitChanges', () => setShowCommit(changes.length > 0));
	useEventListener('action+discardChanges', () => setChanges([]));

	const { mutate: doCommit, report, color } = useMutationHandler(() =>
		apiPost('events/changes', {
			changes: changes.map(({ column, ...c }) => ({ ...c, entity: column.table, column: column.sqlName }))
		})
	, ['tableData']);

	// ************************************************************************************
	// 										SAMPLE
	// ************************************************************************************

	const filters = useSampleState(state => state.filters);
	const sample = useSampleState(state => state.current);
	const isPicking = useSampleState(state => state.isPicking);

	const samplesQuery = useQuery('samples', async () => {
		const { samples } = await apiGet<{ samples: Sample[] }>('events/samples');
		console.log('%cavailable samples:', 'color: #0f0', samples);
		return samples;
	});

	const sampleContext = useMemo(() => {
		const samples = samplesQuery.data;
		if (!mainContext || !samples) return null;
		const { columns, data } = mainContext;
		const applied = isPicking ? data.map(row => [...row]) : applySample(data, sample, columns);
		const filterFn = renderFilters(filters, columns);
		const filtered = applied.filter(row => filterFn(row));
		return {
			data: filtered, 
			current: sample,
			apply: (dt: any[][], id: number) => applySample(dt, samples?.find(s => s.id === id) ?? null, columns),
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
				{showCommit && <ConfirmationPopup style={{ width: 'unset' }} confirm={() => doCommit(null, {
					onSuccess: () => { setShowCommit(false); setChanges([]); }
				})} close={() => setShowCommit(false)} persistent={true}>
					<h4 style={{ margin: '1em 0 0 0' }}>About to commit {changes.length} change{changes.length > 1 ? 's' : ''}</h4>
					<div style={{ textAlign: 'left', padding: '1em 2em 1em 2em' }} onClick={e => e.stopPropagation()}>
						{changes.map(({ id, column, value }) => {
							const row = mainContext.data.find(r => r[0] === id);
							const colIdx = mainContext.columns.findIndex(c => c.id === column.id);
							const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
							const val1 = value == null ? 'null' : valueToString(value);
							return (<div key={id+column.id+value}>
								<span style={{ color: 'var(--color-text-dark)' }}>#{id}: </span>
								<i style={{ color: 'var(--color-active)' }}>{column.fullName}</i> {val0} -&gt; <b>{val1}</b>
								<span className='CloseButton' style={{ transform: 'translate(4px, 2px)' }} onClick={() => 
									setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id)])}>&times;</span>
							</div>);})}
					</div>
					<div style={{ height: '1em', color }}>{report?.error ?? report?.success}</div>
				</ConfirmationPopup>}
				{children}
			</SampleContext.Provider>
		</MainTableContext.Provider>
	);

}