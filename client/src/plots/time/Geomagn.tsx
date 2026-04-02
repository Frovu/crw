import uPlot from 'uplot';
import { basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color } from '../plotUtil';
import type { ContextMenuProps } from '../../layout';
import { usePlot } from '../../events/core/plot';
import type { EventsPanel } from '../../events/core/util';
import { Checkbox } from '../../components/Checkbox';

const defaultParams = {
	showAE: false,
	showAp: false,
	showKp: true,
};

export type GeomagnParams = typeof defaultParams;

const myBars = (params: GeomagnParams) => (scl: number) => (upl: uPlot, seriesIdx: number, i0: number, i1: number) => {
	const colors = [color('green'), color('yellow'), color('orange'), color('red')];
	const lastColor = color('crimson');
	const range = params.showAp ? [18, 39, 67, 179] : [36, 46, 56, 76];
	const values = (u: uPlot, sidx: number) =>
		(u.data[sidx] as number[]).map((v) => {
			for (const [i, mx] of range.entries()) if (v < mx) return colors[i];
			return lastColor;
		});
	return uPlot.paths.bars!({
		size: [1 + upl.data[0].length / 1600, Infinity],
		align: 1,
		disp: {
			y0: {
				unit: 1,
				values: (u) => u.data[seriesIdx].map((v) => 0) as any,
			},
			y1: {
				unit: 1,
				values: (u) => u.data[seriesIdx].map((v) => (!v ? 1 : v)) as any,
			},
			stroke: {
				unit: 3,
				values,
			},
			fill: {
				unit: 3,
				values,
			},
		},
	})(upl, seriesIdx, i0, i1);
};

function Menu({ params, setParams }: ContextMenuProps<GeomagnParams>) {
	const onChange = (what: 'showAp' | 'showKp' | 'showAE') => (chk: boolean) => {
		setParams({
			showAp: chk && what === 'showAp',
			showKp: chk && what === 'showKp',
			showAE: chk && what === 'showAE',
		});
	};

	return (
		<>
			<Checkbox label="Show Ap index" checked={params.showAp} onCheckedChange={onChange('showAp')} />
			<Checkbox label="Show Kp index" checked={params.showKp} onCheckedChange={onChange('showKp')} />
			<Checkbox label="Show AE index" checked={params.showAE} onCheckedChange={onChange('showAE')} />
		</>
	);
}

function Panel() {
	const params = usePlot<GeomagnParams>();
	return (
		<BasicPlot
			{...{
				queryKey: (interval) => ['geomagn', interval],
				queryFn: (interval) =>
					basicDataQuery('omni', interval, ['time', 'kp_index', 'ap_index', 'dst_index', 'ae_index']),
				params,
				axes: () => [
					{
						show: params.showKp || params.showAp,
						label: 'Kp',
						fullLabel: (params.showAp ? 'Ap' : 'Kp') + ' index',
						position: [0, 2 / 5 - 1 / 20],
						minMax: [0, 50],
						showGrid: false,
						values: (u, vals) => vals.map((v) => (v == null ? v : (params.showAp ? v : v / 10).toFixed(0))),
						splits: (u, aidx, min, max) => [0, max > 50 ? 90 : 50],
					},
					{
						label: 'Dst',
						fullLabel: 'Dst, nT',
						position: [2 / 5, 1],
						minMax: [null, 0],
						side: 1,
						ticks: { show: false },
						gap: 0,
					},
					{
						show: params.showAE,
						label: 'AE',
						fullLabel: 'AE, nT',
						position: [0, 1],
					},
				],
				series: () => [
					{
						show: params.showKp,
						label: 'Kp',
						scale: 'Kp',
						legend: 'Kp index',
						width: 0,
						bars: true,
						stroke: color('green'),
						myPaths: myBars(params),
					},
					{
						show: params.showAp,
						label: 'Ap',
						scale: 'Kp',
						width: 0,
						bars: true,
						stroke: color('yellow'),
						myPaths: myBars(params),
					},
					{
						label: 'Dst',
						legend: 'Dst, nT',
						stroke: color('skyblue'),
						width: 2,
						marker: 'circle',
					},
					{
						show: params.showAE,
						label: 'AE',
						legend: 'AE, nT',
						stroke: color('magenta'),
						width: 2,
						marker: 'diamond',
					},
				],
			}}
		/>
	);
}

export const GeomagnPlot: EventsPanel<GeomagnParams> = {
	name: 'Geomagn',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
};
