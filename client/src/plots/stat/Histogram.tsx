import { useContext, useMemo } from 'react';
import uPlot from 'uplot';
import { useFeidSample, useFeidTableView } from '../../events/core/feid';
import type { NumberInput } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import type { Value } from '../../events/columns/columns';
import { useTable } from '../../events/core/editableTables';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportPlot';
import { applySample } from '../../events/sample/sample';
import type { ContextMenuProps } from '../../layout';
import { cn } from '../../util';
import { tooltipPlugin, legendPlugin, labelsPlugin, type CustomAxis } from '../basicPlot';
import { scaled, measureDigit, getFontSize, font, usePlotOverlay, axisDefaults } from '../plotUtil';
import { color } from '../../app';

const colors = ['green', 'purple', 'magenta'] as const;
const yScaleOptions = ['count', 'log', '%'] as const;
const columnKeys = ['column0', 'column1', 'column2'] as const;
const sampleKeys = ['sample0', 'sample1', 'sample2'] as const;

export type HistogramParams = {
	binCount: number;
	forceMin: number | null;
	forceMax: number | null;
	drawMean: boolean;
	drawMedian: boolean;
	showYLabel: boolean;
	showResiduals: boolean;
	yScale: (typeof yScaleOptions)[number];
	sample0: string;
	column0: string | null;
	sample1: string;
	column1: string | null;
	sample2: string;
	column2: string | null;
};

const defaultParams: HistogramParams = {
	binCount: 16,
	forceMin: null,
	forceMax: null,
	yScale: 'count',
	showYLabel: false,
	showResiduals: true,
	sample0: '<current>',
	sample1: '<current>',
	sample2: '<current>',
	column0: 'duration',
	column1: null,
	column2: null,
	drawMean: true,
	drawMedian: false,
};

function Menu({ params, setParams, Checkbox }: ContextMenuProps<HistogramParams>) {
	const { columns } = useFeidTableView();
	const { samples } = useFeidSample();
	const shownColumns = useEventsSettings((st) => st.shownColumns);
	const columnOpts = columns.filter(
		(c) =>
			(['integer', 'real', 'enum'].includes(c.type) && shownColumns?.includes(c.sql_name)) ||
			(['column0', 'column1', 'column2'] as const).some((p) => params[p] === c.sql_name)
	);

	return (
		<>
			{([0, 1, 2] as const).map((i) => (
				<div key={i} className="flex mt-1 gap-2">
					<div
						title="Reset"
						className="cursor-pointer select-none"
						style={{ color: color(colors[i]) }}
						onClick={() => setParams({ [columnKeys[i]]: null, [sampleKeys[i]]: '<current>' })}
					>
						#{i}
					</div>
					<div className="flex">
						<SimpleSelect
							title="Column"
							className={cn('w-24 bg-input-bg/80', params[columnKeys[i]] == null && 'text-dark')}
							options={[
								[null, '<none>'],
								...columnOpts.map(({ sql_name, name }) => [sql_name, name] as [string, string]),
							]}
							value={params[columnKeys[i]] ?? null}
							onChange={(val) => setParams({ [columnKeys[i]]: val })}
						/>
						:
						<SimpleSelect
							title="Sample (none = all events)"
							className={cn(
								'w-36 bg-input-bg/80 justify-center',
								params[sampleKeys[i]] === '<current>' && 'text-dark'
							)}
							options={[
								['<none>', '<none>'],
								['<current>', '<current>'],
								...(samples?.map(({ id, name }) => [id.toString(), name] as [string, string]) ?? []),
							]}
							value={params[sampleKeys[i]]}
							onChange={(val) => setParams({ [sampleKeys[i]]: val })}
						/>
					</div>
				</div>
			))}
			<div className="flex">
				<div>
					Y:
					<select
						className="Borderless"
						style={{ width: '5em', marginLeft: 4, padding: 0 }}
						value={params.yScale}
						onChange={(e) => set('yScale', e.target.value as any)}
					>
						{yScaleOptions.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</select>
				</div>
				<div style={{ paddingLeft: 4 }}>
					Bin count:
					<input
						type="number"
						min="2"
						max="9999"
						style={{ width: '4em', margin: '0 4px', padding: 0 }}
						value={params.binCount}
						onChange={(e) => set('binCount', e.target.valueAsNumber)}
					/>
				</div>
			</div>
			<div style={{ textAlign: 'right' }}>
				<span
					className="TextButton"
					title="Reset"
					style={{ userSelect: 'none', cursor: 'pointer' }}
					onClick={() => setParams({ forceMin: null, forceMax: null })}
				>
					Limits:
				</span>
				<NumberInput
					style={{ width: '4em', margin: '0 4px', padding: 0 }}
					value={params.forceMin}
					onChange={(val) => set('forceMin', val)}
					allowNull={true}
				/>
				&lt;= X &lt;
				<NumberInput
					style={{ width: '4em', margin: '0 4px', padding: 0 }}
					value={params.forceMax}
					onChange={(val) => set('forceMax', val)}
					allowNull={true}
				/>
			</div>
			<div className="flex gap-1">
				<Checkbox label="Show Y label" k="showYLabel" />
				<Checkbox label=" mean" k="drawMean" />
				<Checkbox label=" median" k="drawMedian" />
			</div>
			<Checkbox label="Show residual counts" k="showResiduals" />
		</>
	);
}

function drawResiduals(params: HistogramParams, samples: number[][], min: number, max: number) {
	const left = samples.map((smp) => smp.filter((v) => v < min).length);
	const right = samples.map((smp) => smp.filter((v) => v >= max).length);

	const scale = scaled(1);
	const ch = measureDigit().width;
	const lh = getFontSize();
	const px = (a: number) => scale * a * devicePixelRatio;

	return (u: uPlot) => {
		if (!params.showResiduals) return;
		for (const [which, values] of [
			['left', left],
			['right', right],
		] as const) {
			if (!values.find((v) => v > 0)) continue;
			const vals = params.yScale === '%' ? values.map((v, i) => Math.round((v / samples[i].length) * 1000) / 10) : values;

			const height = px(5) + values.filter((v) => v > 0).length * lh * devicePixelRatio;
			const width =
				px(6) +
				(Math.max.apply(
					null,
					vals.map((v) => v.toString().length)
				) *
					ch +
					ch) *
					devicePixelRatio;

			const x0 = u.bbox.left + (which === 'right' ? u.bbox.width - width : 0);
			const y0 = u.bbox.top + (u.height * 1) / 3 - height;

			u.ctx.save();
			u.ctx.lineWidth = px(1);
			u.ctx.strokeStyle = color('dark');
			u.ctx.fillStyle = color('bg');
			u.ctx.fillRect(x0, y0, width, height);
			u.ctx.strokeRect(x0, y0, width, height);
			u.ctx.textAlign = 'left';
			u.ctx.lineCap = 'butt';
			u.ctx.textBaseline = 'top';

			const x = x0 + px(2);
			let y = y0 + px(3);
			for (const [i, val] of values.entries()) {
				if (val <= 0) continue;

				u.ctx.fillStyle = color(colors[i]);
				u.ctx.fillText('+' + val.toString(), x, y);
				y += lh;
			}
			u.ctx.restore();
		}
	};
}

function drawAverages(params: HistogramParams, samples: Value[][]) {
	const scale = scaled(1);
	const fnt = font(14, true);
	const px = (a: number) => scale * a * devicePixelRatio;
	const averages = {
		mean:
			params.drawMean &&
			samples.map((smpl) => (smpl.length ? (smpl as any[]).reduce((a, b) => a + (b ?? 0), 0) / smpl.length : null)),
		median:
			params.drawMedian &&
			samples.map((smpl) => {
				const s = smpl.sort((a: any, b: any) => a - b) as any,
					mid = Math.floor(smpl.length / 2);
				return s.length % 2 === 0 ? s[mid] : (s[mid] + s[mid + 1]) / 2;
			}),
	} as { [key: string]: (number | null)[] };

	return (u: uPlot) => {
		for (const what in averages) {
			if (!averages[what]) continue;
			for (const [i, value] of averages[what].entries()) {
				if (value == null) continue;
				const x = u.valToPos(value, 'x', true);
				const margin = px(what === 'mean' ? -10 : 1);
				const text = what === 'mean' ? 'a' : 'm';
				u.ctx.save();
				u.ctx.fillStyle = u.ctx.strokeStyle = color(colors[i], what === 'mean' ? 1 : 0.8);
				u.ctx.font = fnt;
				u.ctx.textBaseline = 'top';
				u.ctx.textAlign = 'left';
				u.ctx.lineWidth = px(2);
				u.ctx.beginPath();
				u.ctx.moveTo(x, u.bbox.top + margin + px(14));
				u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
				u.ctx.stroke();
				u.ctx.lineWidth = px(1);
				u.ctx.strokeStyle = color('text');
				u.ctx.stroke();
				u.ctx.fillText(text, x - scale * 3, u.bbox.top + margin);
				u.ctx.restore();
			}
		}
	};
}

function Panel() {
	const { data: allData, columns } = useTable();
	const { showGrid, showLegend } = useEventsSettings();
	const { samples: samplesList, data: sampleData } = useContext(SampleContext);
	const params = usePlot<HistogramParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	const hist = useMemo(() => {
		const { yScale } = params;

		const cols = [0, 1, 2].map((i) =>
			columns.findIndex((c) => c.sql_name === params[('column' + i) as keyof HistogramParams])
		);
		const allSamples = [0, 1, 2].map((i) => {
			const sampleId = params[('sample' + i) as 'sample0' | 'sample1' | 'sample2'];
			const colIdx = cols[i];
			if (!sampleId || colIdx < 0) return [];
			const column = columns[colIdx];
			const data =
				sampleId === '<current>'
					? sampleData
					: sampleId === '<none>'
					? allData
					: applySample(
							allData,
							samplesList.find((s) => s.sql_name.toString() === sampleId) ?? null,
							columns,
							samplesList
					  );
			return data.map((row) => row[colIdx]).filter((val) => val != null || column.type === 'enum');
		});
		const firstIdx = allSamples.findIndex((s) => s.length);
		if (firstIdx < 0) return null;
		const column = columns[cols[firstIdx]];
		const enumMode = !!column.enum;
		const samples = enumMode
			? [allSamples[firstIdx].map((v) => (!v ? 0 : column.enum!.indexOf(v as any) + 1))]
			: allSamples;

		const everything = samples.flat() as number[];
		const min = params.forceMin ?? Math.min.apply(null, everything);
		let max = params.forceMax ?? Math.max.apply(null, everything) + 1;
		const binCount = enumMode ? column.enum!.length + (everything.includes(0) ? 1 : 0) : params.binCount;
		if (params.forceMax == null) {
			const countMax = everything.reduce((a, b) => (b === max ? a + 1 : a), 0);
			if (countMax > 1)
				// workaround for inclusive intervals
				max += (max - min) / (binCount - 1);
		}
		const binSize = (max - min) / binCount;
		if (min === max || !binCount) return null;
		const samplesBins = samples.map((sample) => {
			if (!sample.length) return null;
			const bins = Array(binCount).fill(0);
			for (const val of sample) {
				const bin = Math.floor(((val as number) - min) / binSize);
				if (bin >= 0 && bin < binCount) ++bins[bin];
			}
			return bins as number[];
		});
		// const maxLength = Math.max.apply(null, samples.map(s => s?.length || 0));
		const transformed = samplesBins
			.map((bins, i) => (yScale === '%' ? bins?.map((b) => b / samples[i].length)! : bins!))
			.filter((b) => b);
		const binsValues = transformed[0]?.map((v, i) => min + (i + (enumMode ? 0 : 0.5)) * binSize) || [];

		const colNames = [0, 1, 2]
			.map((i) => params[('column' + i) as keyof HistogramParams])
			.map((c) => columns.find((cc) => cc.sql_name === c)?.fullName);
		const sampleNames = [0, 1, 2]
			.map((i) => params[('sample' + i) as 'sample0' | 'sample1' | 'sample2'])
			.map((id) =>
				['<current>', '<none>'].includes(id)
					? ''
					: ' of ' + (samplesList.find((s) => s.sql_name.toString() === id)?.name ?? 'UNKNOWN')
			);

		// try to prevent short bars from disappearing
		const highest = Math.max.apply(null, transformed.flat());
		const elevated = transformed.map((smp) => smp.map((c) => (c === 0 ? 0 : Math.max(c, highest / 256))));

		const yLabel = yScale === 'log' ? 'log( events count )' : yScale === '%' ? 'events fraction, %' : 'events count';
		return {
			options: () => {
				const scale = scaled(1);
				const ch = measureDigit().width;
				return {
					padding: [12, 14 + (max > 999 ? 4 : 0), 0, 0].map((p) => scaled(p)) as any,
					legend: { show: false },
					focus: { alpha: 0.5 },
					cursor: { focus: { prox: 64 }, drag: { x: false, y: false, setScale: false }, points: { show: false } },
					hooks: {
						draw: [
							drawAverages(params, samples),
							enumMode ? () => {} : drawResiduals(params, samples as any, min, max),
						],
					},
					plugins: [
						tooltipPlugin({
							html: (u, sidx, i) =>
								`${Math.round(u.data[0][i] * 100) / 100} ± ${Math.round((binSize / 2) * 100) / 100};` +
								`<span style="color: ${(u.series[sidx].stroke as any)()}"> ` +
								(Math.round(u.data[sidx][i]! * 100) / (yScale === '%' ? 1 : 100)).toString() +
								(yScale === '%' ? ' %' : ' events') +
								'</span>',
						}),
						legendPlugin({ params: { showLegend }, overlayHandle }),
						labelsPlugin({ params: { showLegend } }),
					],
					axes: [
						{
							...axisDefaults(showGrid),
							size: scaled(12) + getFontSize(),
							space: getFontSize() * 3,
							labelSize: getFontSize(),
							fullLabel: colNames.filter((a) => a && a.length > 0).join(', '),
							label: '',
							gap: scaled(2),
							values: (u, vals) => vals.map((v) => v),
							...(enumMode && {
								values: (u, vals) =>
									vals.map((v) => (v != null && v % 1 === 0 ? ['N/A', ...column.enum!][v] : '')),
							}),
						},
						{
							...axisDefaults(showGrid),
							values: (u, vals) =>
								vals.map(
									(v) =>
										v &&
										(yScale === '%' ? (v * 100).toFixed(0) + (params.showYLabel ? '' : '%') : v.toFixed())
								),
							gap: scaled(2),
							fullLabel: params.showYLabel ? yLabel : '',
							label: params.showYLabel ? '' : undefined,
							labelSize: getFontSize() + scaled(3),
							size: (u, values) =>
								scale * 12 +
								ch *
									(values
										? Math.max.apply(
												null,
												values.map((v) => v?.toString().length ?? 0)
										  )
										: 4),
							space: getFontSize() * 3,
						} as CustomAxis,
					],
					scales: {
						x: {
							time: false,
							range: () =>
								!enumMode ? [min, max] : [min - binSize / 2, max + (binSize / 2) * (enumMode ? -1 : 1)],
						},
						y: {
							distr: yScale === 'log' ? 3 : 1,
						},
					},
					series: [
						{},
						...[
							{
								bars: true,
								label: colNames[0],
								legend: `${colNames[0]}${sampleNames[0]}`,
								stroke: color(colors[0]),
								fill: color(colors[0], 0.8),
								width: 0,
								points: { show: false },
								paths: uPlot.paths.bars!({ size: [0.8, scaled(64)] }),
							},
							{
								bars: true,
								label: colNames[1],
								legend: `${colNames[1]}${sampleNames[1]}`,
								stroke: color(colors[1]),
								fill: color(colors[1]),
								width: 0,
								points: { show: false },
								paths: uPlot.paths.bars!({ size: [0.5, scaled(64)] }),
							},
							{
								bars: true,
								label: colNames[2],
								legend: `${colNames[2]}${sampleNames[2]}`,
								stroke: color(colors[2]),
								fill: color(colors[2]),
								width: 0,
								points: { show: false },
								paths: uPlot.paths.bars!({ size: [0.25, scaled(64)] }),
							},
						].filter((ser, i) => samplesBins[i]),
					],
				} as Omit<uPlot.Options, 'width' | 'height'>;
			},
			data: [binsValues, ...elevated] as any,
		};
	}, [params, columns, sampleData, allData, samplesList, showLegend, overlayHandle, showGrid]);

	if (!hist) return <div className="center">NOT ENOUGH DATA</div>;
	return <ExportableUplot {...{ ...hist }} />;
}

export const Histogram = {
	name: 'Histogram',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
