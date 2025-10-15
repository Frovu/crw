import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, prettyDate, useMonthInput } from '../../util';
import { axisDefaults, seriesDefaults, color, ScatterPlot, customTimeSplits } from '../../plots/plotUtil';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import regression from 'regression';
import uPlot from 'uplot';
import { useNavigationState, NavigationContext, NavigatedPlot } from '../../plots/NavigatedPlot';

const ORDER = ['time', 'original', 'revised', 'corrected', 'expected', 'expected+', 'a0', 'axy', 'az', 't_mass_average', 'pressure'] as const;

type CoefInfo = {
	coef: {
		tm?: number;
		p?: number;
		c0: number;
		cx: number;
		cy: number;
		cz: number;
		cxy?: number;
		phi?: number;
	};
	error: {
		tm?: number;
		p?: number;
		c0: number;
		cx: number;
		cy: number;
		cz: number;
		cxy?: number;
		phi?: number;
	};
	length?: number;
	time?: number;
	modified?: boolean;
};
type MuonContextType = {
	experiments: {
		name: string;
		since: number;
		until: number | null;
		longitude: number;
		channels: {
			name: string;
			correction: Required<CoefInfo> | null;
		}[];
	}[];
};
const MuonContext = createContext<MuonContextType>({} as any);

function options(): Omit<uPlot.Options, 'width' | 'height'> {
	const filter =
		(dir: number): uPlot.Axis.Filter =>
		(u, splits, ax) => {
			const scale = u.scales[u.axes[ax].scale!];
			const threshold = scale.min! + ((scale.max! - scale.min!) * 2) / 3;
			return splits.map((spl, i) => ((dir > 0 ? spl > threshold : spl < threshold) ? spl : null));
		};
	return {
		padding: [12, 0, 0, 0],
		scales: {
			temp: {
				range: (u, min, max) => [min - (max - min) * 2, max + 1],
			},
			press: {
				range: (u, min, max) => [min - (max - min) * 2, max + 1],
			},
			variation: {
				range: (u, min, max) => [min - 0.1, max + ((max - min) * 2) / 3],
			},
		},
		axes: [
			{
				...axisDefaults(true),
				...customTimeSplits(),
			},
			{
				...axisDefaults(true, filter(-1)),
				scale: 'variation',
				values: (u, vals) => vals.map((v) => (v == null ? '' : v.toString() + ' %')),
			},
			{
				...axisDefaults(false, filter(1)),
				scale: 'temp',
				ticks: { show: false },
				gap: -36,
				size: 12,
				values: (u, vals) => vals.map((v) => (v == null ? '' : v.toString() + ' K')),
			},
			{
				...axisDefaults(false, filter(1)),
				side: 1,
				scale: 'press',
				values: (u, vals) => vals.map((v) => v?.toString()),
			},
		],
		series: [
			{
				label: 't',
				value: '{YYYY}-{MM}-{DD} {HH}:{mm}',
				stroke: color('text'),
			},
			{
				...seriesDefaults('original', 'magenta', 'variation'),
				value: (u, val) => val?.toFixed(2) ?? '--',
				points: { show: true, width: 0.1, size: 4, fill: color('magenta') },
				width: 1,
				show: false,
			},
			{
				...seriesDefaults('revori', 'blue', 'variation'),
				value: (u, val) => val?.toFixed(2) ?? '--',
				show: false,
			},
			{
				...seriesDefaults('corrected', '', 'variation'),
				stroke: 'rgb(0,170,90)',
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('expected', 'peach', 'variation'),
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('expected+', 'acid', 'variation'),
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('a0', 'magenta', 'variation'),
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('axy', 'cyan', 'variation'),
				show: false,
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('az', 'blue', 'variation'),
				show: false,
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('t_m', 'gold', 'temp'),
				value: (u, val) => val?.toFixed(2) ?? '--',
			},
			{
				...seriesDefaults('p', 'purple', 'press'),
				value: (u, val) => val?.toFixed(1) ?? '--',
			},
		],
	};
}

function MuonApp() {
	const queryClient = useQueryClient();
	const { experiments } = useContext(MuonContext);
	const experimentNames = experiments.map((exp) => exp.name);
	const [interval, monthInput] = useMonthInput(new Date(new Date().getUTCFullYear() - 2, 0, 1), 24, 48);
	const [{ experiment, channel }, setExperiment] = useState(() => ({ experiment: experimentNames[0], channel: 'V' }));
	const { channels, until, since, longitude } = experiments.find((exp) => exp.name === experiment)!;
	const corrInfo = channels.find((c) => c.name === channel)?.correction;
	const [averaging, setAveraging] = useState(1);
	const [upl, setUpl] = useState<uPlot>();
	const navigation = useNavigationState();

	const query = useQuery({
		retry: false,
		queryKey: ['muon', interval, experiment, channel],
		queryFn: () =>
			apiGet<{ fields: string[]; rows: (number | null)[][] }>('muon', {
				from: interval[0],
				to: interval[1],
				experiment,
				query: 'original,revised,corrected,a0,axy,az,expected,t_mass_average,pressure',
			}),
	});

	const { min, max } = navigation.state.selection ?? navigation.state.view;
	const [fetchFrom, fetchTo] =
		!upl?.data || (min === 0 && max === upl.data[0].length - 1) ? interval : [min, max].map((i, n) => upl.data[0][i] ?? interval[n]);

	const fitOptions = ['all', 'gsm', 'axy'] as const;
	const [showCxy, setShowCxy] = useState(true);
	const [fitCoefs, setFitCoefs] = useState<(typeof fitOptions)[number]>('all');
	const queryCoef = useQuery({
		queryKey: ['muon', 'compute', fetchFrom, fetchTo, fitCoefs, experiment, channel],
		queryFn: () =>
			apiGet<{ info: CoefInfo | null; time: number[]; expected: number[] }>('muon/compute', {
				fit: fitCoefs,
				from: fetchFrom,
				to: fetchTo,
				experiment,
				channel,
			}),
	});

	const [plotData, nonnull] = useMemo(() => {
		if (!query.data || query.data.rows.length < 2) return [null, null];

		const length = query.data.rows.length;
		const data = Object.fromEntries(query.data.fields.map((f, i) => [f, query.data.rows.map((row) => row[i])]));

		data['expected+'] = Array(length).fill(null);
		if (queryCoef.data?.info != null) {
			const etime = queryCoef.data.time,
				edata = queryCoef.data.expected;
			const i0 = data['time'].findIndex((t) => t === etime.at(0));
			const i1 = data['time'].findLastIndex((t) => t === etime.at(-1));
			if (i0 >= 0 && i1 >= 0 && i1 - i0 === edata.length - 1 && edata.length !== length) {
				for (let i = 0; i <= edata.length; ++i) data['expected+'][i0 + i] = edata[i];
			}
		}

		const variationSeries = ['revised', 'corrected', 'a0', 'expected'];
		const varAverages = variationSeries.map((ii) => data[ii].reduce((a, b) => a! + (b ?? 0), 0)! / data[ii].filter((v) => v != null).length);
		data['original'] = data['original'].map((v, i) => (v !== data['revised'][i] ? v : null));
		for (const [i, ser] of [...variationSeries.entries()].concat([[0, 'original']]))
			data[ser] = data[ser].map((v) => (v == null ? null : (v - varAverages[i]) / (1 + varAverages[i] / 100)));
		data['expected+'] = data['expected+'].map((v) => (v == null ? null : (v - varAverages.at(-1)!) / (1 + varAverages.at(-1)! / 100)));

		const counts = Object.fromEntries(Object.entries(data).map(([ser, vals]) => [ser, vals.filter((v) => v != null).length]));

		const series = ORDER.map((s) => data[s]);
		if (averaging === 1) return [series, counts];

		const averaged: (number | null)[][] = series.map((s) => Array(Math.ceil(length / averaging) + 1).fill(null));
		for (let ai = 0; ai < averaged[0].length; ++ai) {
			const cur = ai * averaging;
			averaged[0][ai] = series[0][cur];
			for (let si = 1; si < series.length; ++si) {
				let acc = 0,
					cnt = 0;
				for (let i = 0; i < averaging; ++i) {
					const val = series[si][cur + i];
					if (val == null) continue;
					acc += val;
					++cnt;
				}
				averaged[si][ai] = cnt === 0 ? null : acc / cnt;
			}
		}
		averaged[0][averaged[0].length - 1] = data['time'][length - 1]; // a hack to prevent plot reset due to bound times change

		return [averaged, counts];
	}, [query.data, queryCoef.data, averaging]);

	const [correlationTarget, setCorrelationTarget] = useState<(typeof ORDER)[number]>('expected+');
	const correlationPlot = useMemo(() => {
		if (!plotData) return null;
		const target = correlationTarget === 'expected+' && fetchFrom === interval[0] && fetchTo === interval[1] ? 'expected' : correlationTarget;
		const [xColIdx, yColIdx] = (['corrected', target] as const).map((f) => ORDER.indexOf(f));
		const data = plotData;
		const filtered: [number, number][] = [...data[0].keys()]
			.filter((i) => fetchFrom <= data[0][i]! && data[0][i]! <= fetchTo && data[xColIdx][i] != null && data[yColIdx][i] != null)
			.map((i) => [data[xColIdx][i]!, data[yColIdx][i]!]);
		if (filtered.length < 2) return null;
		const transposed = [0, 1].map((i) => filtered.map((r) => r[i])) as [number[], number[]];

		const minX = Math.min.apply(null, transposed[0]);
		const maxX = Math.max.apply(null, transposed[0]);
		const regr = regression.linear(filtered, { precision: 8 });
		const regrX = Array(128)
			.fill(0)
			.map((_, i) => minX + (i * (maxX - minX)) / 128);
		const regrY = regrX.map((x) => regr.predict(x)[1]);

		return (
			<div title={'X: corrected, Y: ' + correlationTarget}>
				<div style={{ paddingBottom: 4, textAlign: 'center' }}>
					<label style={{ fontSize: 14, paddingRight: 12 }}>
						target{' '}
						<select
							style={{ width: 92, textAlign: 'center' }}
							value={correlationTarget}
							onChange={(e) => setCorrelationTarget(e.target.value as any)}
						>
							{ORDER.slice(2).map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</label>
					a={regr.equation[0].toFixed(3)}, R<sup>2</sup>={regr.r2.toFixed(3)}
				</div>
				<div style={{ position: 'relative', height: 280 }}>
					<ScatterPlot data={[transposed, [regrX, regrY]]} colour="orange" />
				</div>
			</div>
		);
	}, [plotData, fetchFrom, fetchTo, correlationTarget, interval]);

	type mutResp = { status: 'busy' | 'ok' | 'error'; downloading?: { [key: string]: number }; message?: string };
	const obtainMutation = useMutation({
		mutationFn: (partial?: boolean) =>
			apiPost<mutResp>('muon/obtain', {
				from: fetchFrom,
				to: fetchTo,
				experiment,
				channel,
				partial,
			}),
		onSuccess: ({ status }, partial) => {
			if (status === 'busy') {
				setTimeout(() => obtainMutation.mutate(partial), 500);
			} else {
				if (status === 'ok') queryClient.invalidateQueries({ queryKey: ['muon'] });
				setTimeout(() => obtainMutation.isSuccess && obtainMutation.reset(), 3000);
			}
		},
	});

	const revisionMut = useMutation({
		mutationFn: (action: 'remove' | 'revert') =>
			apiPost('muon/revision', {
				from: navigation.state.cursor?.lock ? plotData![0][navigation.state.cursor.idx] : fetchFrom,
				to: navigation.state.cursor?.lock ? plotData![0][navigation.state.cursor.idx] : fetchTo,
				experiment,
				channel,
				action,
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muon'] }),
	});

	type MutCoef = { p?: number; tm?: number; action: 'update' | 'reset' };
	const coefMut = useMutation({
		mutationFn: ({ p, tm, action }: MutCoef) =>
			apiPost('muon/coefs', {
				experiment,
				channel,
				p,
				tm,
				action,
				from: fetchFrom,
				to: fetchTo,
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muon'] }),
	});

	const defaultInput = () =>
		Object.fromEntries((['p', 'tm'] as const).map((coef) => [coef, corrInfo ? ((corrInfo.coef?.[coef] ?? 0) * 100).toFixed(3) : '?']));
	const [input, setInputState] = useState(defaultInput);
	useEffect(() => setInputState(defaultInput()), [corrInfo]); // eslint-disable-line

	const [displayCoef, displayCoefUsed] = useMemo(() => {
		const calcDisplayCoef = (info: CoefInfo): { coef: any[]; error: any[] } => {
			const keys = ['p', 'tm', 'c0', ...(showCxy ? (['cxy', 'phi'] as const) : (['cx', 'cy'] as const)), 'cz'] as const;
			const inf = { coef: { ...corrInfo?.coef, ...info.coef }, error: { ...corrInfo?.error, ...info.error } };
			if (showCxy) {
				inf.coef['cxy'] = Math.hypot(inf.coef['cx'], inf.coef['cy']);
				inf.coef['phi'] = (Math.atan2(inf.coef['cy'] * -100, inf.coef['cx'] * -100) * 180) / Math.PI - longitude;
				inf.error['cxy'] = Math.hypot(inf.error['cx'], inf.error['cy']);
				inf.error['phi'] = Math.abs(
					(Math.atan2((inf.error['cy'] - inf.coef['cy']) * 100, (inf.error['cx'] - inf.coef['cx']) * 100) * 180) / Math.PI - inf.coef['phi'],
				);
			}
			const grey = fitCoefs === 'gsm' ? ['tm', 'p'] : fitCoefs === 'axy' ? ['tm', 'p', 'c0', 'cz'] : [];
			return Object.fromEntries(
				(['coef', 'error'] as const).map((what) => [
					what,
					keys.map((k, i) => (
						<td key={k} style={{ width: 46, color: grey.includes(k) ? color('text-dark') : 'unset' }}>
							{inf[what][k] != null
								? k === 'phi'
									? inf[what][k]?.toFixed(1)
									: (Math.abs(inf[what][k]!) * 100)?.toFixed(3).replace('0.', '.')
								: ''}
						</td>
					)),
				]),
			) as any;
		};
		return [queryCoef.data?.info && calcDisplayCoef(queryCoef.data.info), corrInfo && calcDisplayCoef(corrInfo)];
	}, [queryCoef.data, corrInfo, fitCoefs, longitude, showCxy]);
	const rmCount = plotData && (navigation.state.cursor?.lock ? 1 : (fetchTo - fetchFrom) / 3600);
	const isObtaining = obtainMutation.isPending || (obtainMutation.isSuccess && obtainMutation.data.status === 'busy');
	return (
		<NavigationContext.Provider value={navigation}>
			<div style={{ height: '100%', display: 'grid', gridTemplateColumns: '360px 1fr', gap: 4, userSelect: 'none' }}>
				<div style={{ overflowY: 'scroll' }}>
					<div>
						<label>
							Experiment:{' '}
							<select
								value={experiment}
								style={{ maxWidth: 150 }}
								onChange={(e) => setExperiment((exp) => ({ experiment: e.target.value, channel: 'V' }))}
							>
								{experimentNames.map((exp) => (
									<option key={exp} value={exp}>
										{exp}
									</option>
								))}
							</select>
						</label>
						<label title="Telescope channel">
							:
							<select
								value={channel}
								style={{ width: 42, textAlign: 'center' }}
								onChange={(e) => setExperiment((exp) => ({ ...exp, channel: e.target.value }))}
							>
								{channels.map(({ name }) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</select>
						</label>
					</div>
					<div title={'longitude = ' + longitude} style={{ color: color('text-dark'), fontSize: 14, textAlign: 'right', paddingRight: 14 }}>
						operational {until ? 'from' : 'since'} {prettyDate(since, true)} {until ? 'to ' + prettyDate(until, true) : ''}
					</div>
					<div style={{ paddingTop: 4 }}>Show: {monthInput}</div>
					{nonnull && (
						<div style={{ paddingTop: 8, paddingRight: 8, display: 'flex', justifyContent: 'space-between' }}>
							<span style={{ color: color('border') }}>
								[<span title="Total points">{nonnull['time']}</span>
								{nonnull['original'] > 0 && (
									<span title="Revised points" style={{ color: color('magenta') }}>
										-{nonnull['original']}
									</span>
								)}
								]
							</span>
							<span title="Revised coverage" style={{ color: color('cyan') }}>
								[{((nonnull['revised'] / nonnull['time']) * 100).toFixed(0)}%]
							</span>
							<span title="Corrected coverage" style={{ color: color('green') }}>
								[{((nonnull['corrected'] / nonnull['time']) * 100).toFixed(0)}%]
							</span>
							<span title="Temperature coverage" style={{ color: color('gold') }}>
								[{((nonnull['t_mass_average'] / nonnull['time']) * 100).toFixed(0)}%]
							</span>
							<span title="GSM expected coverage" style={{ color: color('orange') }}>
								[{((nonnull['expected'] / nonnull['time']) * 100).toFixed(0)}%]
							</span>
						</div>
					)}
					{plotData && (
						<div style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', paddingRight: 12 }}>
							<label title="Only visual">
								Average{' '}
								<input
									style={{ width: 42, textAlign: 'center' }}
									type="number"
									min="1"
									max="24"
									value={averaging}
									onChange={(e) => setAveraging(e.target.valueAsNumber)}
								/>{' '}
								h
							</label>
							<span
								title="Fix some coefficients"
								style={{ cursor: 'pointer' }}
								onClick={() => setFitCoefs((s) => fitOptions[(fitOptions.indexOf(s) + 1) % fitOptions.length])}
							>
								fit={fitCoefs}
							</span>
						</div>
					)}
					{plotData && (
						<table style={{ textAlign: 'center', fontSize: 14, borderSpacing: 3 }}>
							<tr title="Switch between cx/cy and cxy/φ" style={{ cursor: 'pointer' }} onClick={() => setShowCxy((s) => !s)}>
								<td></td>
								<td>p</td>
								<td>t</td>
								<td>c0</td>
								{showCxy && (
									<>
										<td>cxy</td>
										<td>φ</td>
									</>
								)}
								{!showCxy && (
									<>
										<td>cx</td>
										<td>cy</td>
									</>
								)}
								<td>cz</td>
							</tr>
							<tr title="Computed using data from viewed/selected interval">
								<td>&nbsp;cur</td>
								{displayCoef && displayCoef.coef}
							</tr>
							<tr title="Standard errors">
								<td>&nbsp;err</td>
								{displayCoef && displayCoef.error}
							</tr>
							<tr title="Actually used for corrections (saved)" style={{ boxShadow: '0 -1px 0 var(--color-border)' }}>
								<td>used</td>
								{(['p', 'tm'] as const).map((coef, i) => (
									<td style={{ padding: '4px 1px 0 1px' }}>
										<input
											type="text"
											style={{ width: 48, textAlign: 'center', color: color(corrInfo ? 'text' : 'red') }}
											value={input[coef]}
											onChange={(e) => setInputState((st) => ({ ...st, [coef]: e.target.value }))}
											onKeyDown={(e) => ['Escape', 'Enter', 'NumpadEnter'].includes(e.code) && (e.target as HTMLInputElement)?.blur()}
											onBlur={(e) =>
												!isNaN(parseFloat(e.target.value)) &&
												parseFloat(e.target.value) / 100 !== corrInfo?.coef[coef] &&
												coefMut.mutate({ [coef]: parseFloat(e.target.value) / 100, action: 'update' })
											}
										/>
									</td>
								))}
								{displayCoefUsed && displayCoefUsed.coef.slice(2)}
							</tr>
						</table>
					)}
					{plotData && (
						<div style={{ paddingTop: 4, fontSize: 14 }}>
							<button style={{ width: 52, marginRight: 8 }} onClick={() => coefMut.mutate({ action: 'reset' })}>
								reset
							</button>
							{corrInfo == null && <>coefficients are not set</>}
							{corrInfo && (
								<span style={{ color: color('text-dark'), fontSize: 12 }}>
									set /{corrInfo.length && `[${Math.floor(corrInfo.length / 24)} d] `}
									at {prettyDate(corrInfo.time)}
									{corrInfo.modified && <div>(modified manually)</div>}
								</span>
							)}
						</div>
					)}
					<div style={{ paddingTop: 4 }}>{correlationPlot}</div>
					<div style={{ textAlign: 'right', paddingRight: 8, paddingTop: 4 }}>
						<div style={{ display: 'inline-block', padding: 8, border: '1px solid', borderColor: color('red', 0.6) }}>
							<div style={{ color: color('text'), verticalAlign: 'top', fontSize: 14 }}>
								<div style={{ display: 'inline-block', color: color('text-dark'), textAlign: 'right', lineHeight: 1.25 }}>
									<span style={{ color: color('text') }}>[{Math.ceil((fetchTo - fetchFrom) / 3600) + 1} h] </span>
									{prettyDate(fetchFrom)}
									<br />
									&nbsp;&nbsp;to {prettyDate(fetchTo)}
								</div>
							</div>
							<div style={{ paddingTop: 8 }} title="Re-obatin all data for focused interval">
								<button style={{ padding: 2, width: 230 }} disabled={isObtaining} onClick={() => obtainMutation.mutate(false)}>
									{isObtaining ? 'stand by...' : 'Obtain all'}
								</button>
							</div>
							<div style={{ paddingTop: 8 }} title="Re-obatin data for focused interval excluding temperature">
								<button style={{ padding: 2, width: 230 }} disabled={isObtaining} onClick={() => obtainMutation.mutate(true)}>
									{isObtaining ? 'stand by...' : 'Obtain data'}
								</button>
							</div>
							{plotData && (
								<div style={{ paddingTop: 8 }} title="Mask selected points (this is kind of reversible)">
									<button style={{ padding: 2, width: 230 }} disabled={revisionMut.isPending} onClick={() => revisionMut.mutate('remove')}>
										{revisionMut.isPending ? '...' : `Remove [${rmCount}]`}
									</button>
								</div>
							)}
							{plotData && (
								<div style={{ paddingTop: 8 }} title="Clear all revisions (this action is irreversible)">
									<button style={{ padding: 2, width: 230 }} disabled={revisionMut.isPending} onClick={() => revisionMut.mutate('revert')}>
										{revisionMut.isPending ? '...' : 'Clear revisions'}
									</button>
								</div>
							)}
						</div>
					</div>
					<div style={{ paddingTop: 12, paddingLeft: 8 }}>
						<div>{obtainMutation.data?.status === 'busy' && obtainMutation.data?.message}</div>
						{Object.entries(obtainMutation.data?.downloading ?? {}).map(([year, progr]) => (
							<div key={year}>
								downloading {year}: <span style={{ color: color('acid') }}>{(progr * 100).toFixed(0)} %</span>
							</div>
						))}
						<div
							style={{ color: color('red'), cursor: 'pointer' }}
							onClick={() => {
								revisionMut.reset();
								obtainMutation.reset();
								coefMut.reset();
							}}
						>
							{!obtainMutation.isIdle && query.error?.toString()}
							{coefMut.error?.toString()}
							{revisionMut.error?.toString()}
							{obtainMutation.error?.toString()}
							{obtainMutation.data?.status === 'error' && obtainMutation.data?.message}
						</div>
						{obtainMutation.data?.status === 'ok' && <div style={{ color: color('green') }}>Obtain successful</div>}
					</div>
				</div>
				<div style={{ position: 'relative' }}>
					{query.isLoading && <div className="center">LOADING...</div>}
					{query.data && !plotData && <div className="center">NO DATA</div>}
					{plotData && <NavigatedPlot {...{ data: plotData, options, legendHeight: 72, onCreate: setUpl }} />}
				</div>
			</div>
		</NavigationContext.Provider>
	);
}

export default function MuonWrapper() {
	const query = useQuery({ queryKey: ['muon', 'experiments'], queryFn: () => apiGet<MuonContextType>('muon/experiments') });

	const parsed = useMemo((): MuonContextType | null => {
		if (!query.data) return null;
		console.log('muon experiments: ', query.data.experiments);
		return query.data;
	}, [query.data]);

	return (
		<>
			{query.isLoading && <div>Loading experiments list...</div>}
			{query.isError && <div style={{ color: color('red') }}>Failed to load experiments: {query.error?.toString()}</div>}
			{parsed && parsed.experiments.length < 1 && <div>No experiments found</div>}
			{parsed && parsed.experiments.length > 0 && (
				<MuonContext.Provider value={parsed}>
					<MuonApp />
				</MuonContext.Provider>
			)}
		</>
	);
}
