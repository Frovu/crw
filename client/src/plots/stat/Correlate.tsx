import { useMemo } from 'react';
import { type Color } from '../../app/app';
import { type ContextMenuProps } from '../../app/layout';
import { Button } from '../../components/Button';
import { NumberInput } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import { useTable, type TableRow } from '../../events/core/editableTables';
import { useEventsState } from '../../events/core/eventsState';
import { useFeidSample, useFeidTableView } from '../../events/core/feid';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { applySample } from '../../events/sample/sample';
import { cn } from '../../util';
import { usePlotOverlay } from '../common/plotOverlay';
import { scaled } from '../common/plotUtil';
import { useColumnOptions, useSampleOptions, type SampleOption } from './statPlotUtils';
import ColorSelect from '../../components/ColorSelect';
import { computeR2Score, LinearRegression } from './regression';
import CorrelationMatrix from './CorrelationMatrix';
import type { Column } from '../../api';
import CorrelationPlot from './CorrelationPlot';

const colors = ['green', 'magenta', 'gold', 'cyan'] as const;

const limitKeys = [
	['X', 'forceMin', 'forceMax'],
	['Y', 'forceMinY', 'forceMaxY'],
] as const;

const corrModes = ['plot', 'matrix'] as const;

type CorrY = {
	color: Color;
	sample: SampleOption;
	column: string;
};

export type CorrelationSeries = {
	X: number[][];
	Y: number[];
	ids: number[];
	predictions: number[];
	weights: number[];
	errors: number[];
	R2: number;
	cols: Column[];
	sampleName: string;
	sampleData: TableRow[];
	color: Color;
};

const defaultParams = {
	correlationX: [] as string[],
	correlationY: [] as CorrY[],
	correlationMode: 'plot' as (typeof corrModes)[number],
	forceMin: null as number | null,
	forceMax: null as number | null,
	forceMinY: null as number | null,
	forceMaxY: null as number | null,
	showRegression: true,
	loglog: false,
	logx: true,
};

export type CorrelationParams = typeof defaultParams;

function Menu({ params, set, setParams, Checkbox }: ContextMenuProps<CorrelationParams>) {
	const sampleOpts = useSampleOptions();
	const columnOpts = useColumnOptions(['integer', 'real'], [...params.correlationX, ...params.correlationY.map((c) => c.column)]);
	const { correlationX: corrX, correlationY: corrY } = params;

	const setX = (prev: string | null, val: string | null) =>
		set(
			'correlationX',
			prev ? (val ? corrX.map((c) => (c === prev ? val : c)) : corrX.filter((c) => c !== prev)) : val ? [...corrX, val] : corrX,
		);

	const setY = <K extends keyof CorrY>(col: CorrY, key: K, val: CorrY[K]) =>
		set(
			'correlationY',
			corrY.map((c) => (c.column === col.column ? { ...c, [key]: val } : c)),
		);

	const addY = (column: string) =>
		set('correlationY', [
			...corrY,
			{ color: colors.find((clr) => !corrY.find((c) => c.color === clr)) ?? 'white', column, sample: '<current>' },
		]);

	const rmY = (col: CorrY) =>
		set(
			'correlationY',
			corrY.filter((c) => c.column !== col.column || c.sample !== col.sample),
		);

	return (
		<>
			{[...corrX, null].map((colName, i) => (
				<div key={colName} className="flex gap-1">
					<Button title="Remove" className={!colName ? 'text-dark' : ''} onClick={() => setX(colName, null)}>
						X{i + 1}:
					</Button>
					<SimpleSelect
						className="w-30 bg-input-bg"
						value={colName}
						onChange={(val) => setX(colName, val)}
						options={[...(colName ? [[null, '<clear>'] as const] : []), ...columnOpts.map((col) => [col.sql_name, col.name] as const)]}
					/>
				</div>
			))}
			{[...corrY, null].map((col, i) => (
				<div className="flex gap-1 items-center">
					<ColorSelect disabled={!col} value={col?.color ?? 'dark'} onChange={(val) => setY(col!, 'color', val)} />
					<SimpleSelect
						title="Sample (none = all events)"
						className={cn('bg-input-bg w-30', col?.sample === '<current>' && 'text-dark')}
						value={col?.sample ?? '<current>'}
						onChange={(val) => setY(col!, 'sample', val)}
						disabled={!col}
						options={sampleOpts}
					/>
					<Button title="Remove" className={!col ? 'text-dark' : ''} onClick={() => col && rmY(col)}>
						Y{i + 1}:
					</Button>
					<SimpleSelect
						className="w-30 bg-input-bg"
						value={col?.column ?? null}
						onChange={(val) => (!col ? addY(val!) : val ? setY(col, 'column', val) : rmY(col))}
						options={[...(col ? [[null, '<clear>'] as const] : []), ...columnOpts.map((col) => [col.sql_name, col.name] as const)]}
					/>
				</div>
			))}
			<div className="flex gap-1"></div>
			{limitKeys.map(([label, kmin, kmax]) => (
				<div key={label} className="flex gap-1 h-6">
					<Button title="Reset limits" onClick={() => setParams({ [kmin]: null, [kmax]: null })}>
						Limit {label}:
					</Button>
					<NumberInput className="w-12" value={params[kmin]} onChange={(val) => set(kmin, val)} allowNull={true} />
					;
					<NumberInput className="w-12" value={params[kmax]} onChange={(val) => set(kmax, val)} allowNull={true} />
				</div>
			))}
			<div className="flex items-center">
				Display mode:
				<SimpleSelect
					className="w-24"
					value={params.correlationMode}
					onChange={(val) => set('correlationMode', val)}
					options={corrModes.map((m) => [m, m] as const)}
				/>
			</div>
			<div className="flex gap-3">
				<Checkbox label="regression" k="showRegression" />
				<Checkbox label="loglog" k="loglog" />
				<Checkbox label="logx" k="logx" />
			</div>
		</>
	);
}

function Panel() {
	const { data: shownData } = useFeidTableView();
	const { data: allData, columns, index } = useTable('feid');
	const { data: currentData, samples: samplesList } = useFeidSample();
	const params = usePlot<CorrelationParams>();

	const series: CorrelationSeries[] = useMemo(() => {
		return params.correlationY
			.map(({ column, sample, color }) => {
				const sd = sample === '<current>' ? currentData : sample === '<none>' ? allData : null;
				const sampleData = sd ?? applySample(allData, samplesList?.find((s) => s.id === sample) ?? null, columns, samplesList ?? []);
				const sampleName = samplesList?.find((s) => s.id === sample)?.name ?? sample.toString();

				if (!sampleData.length) return null;
				const colIdx = [column, ...params.correlationX].map((c) => columns.findIndex((cc) => cc.sql_name === c));
				if (colIdx.includes(-1)) throw new Error('Column not found');
				const cols = colIdx.map((c) => columns[c]);

				// const filter = loglog ? (r: number[]) => r.every((v) => v > 1) : (r: number[]) => r.every((v) => v != null);
				const filtered = sampleData.filter((row) => colIdx.every((i) => row[i] != null)) as number[][];
				const Y = filtered.map((row) => row[colIdx[0]]);
				const X = filtered.map((row) => colIdx.slice(1).map((i) => row[i]));
				const ids = filtered.map((row) => row[0]);

				if (filtered.length < 8) return null;

				console.time('regression');
				const regr = new LinearRegression();
				regr.fit(X, Y);
				const { weights } = regr;

				const errors = regr.computeStandardErrors(X, Y);
				const predictions = regr.predict(X);
				const R2 = computeR2Score(Y, predictions);
				console.timeEnd('regression');

				console.log('weights:', regr.weights);
				console.log('errors:', errors);

				return { X, Y, predictions, errors, weights, R2, cols, color, sampleName, sampleData, ids };
			})
			.filter((y) => !!y);
	}, [allData, columns, currentData, params.correlationX, params.correlationY, samplesList]);

	if (!series.length) return <div className="center">NOT ENOUGH DATA</div>;
	if (params.correlationMode === 'matrix') return <CorrelationMatrix series={series} />;

	return <CorrelationPlot series={series} />;
}

export const Correlation = {
	name: 'Correlation',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
