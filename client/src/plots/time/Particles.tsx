import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, scaled, superScript } from '../plotUtil';
import { useSolarPlotContext } from './solar';

const PARTICLES = {
	'e1k': '80-115 keV',
	'e2k': '115-165 keV',
	'e3k': '165-235 keV',
	'e4k': '235-340 keV',
	'e5k': '340-500 keV',
	'e6k': '500-700 keV',
	'e7k': '700-1000 keV',
	'e8k': '1000-1900 keV',
	'e9k': '1900-3200 keV',
	'e10k': '3200-6500 keV',
	'p1': '>1 MeV',
	'p2': '>5 MeV',
	'p3': '>10 MeV',
	'p4': '>30 MeV',
	'p5': '>50 MeV',
	'p6': '>60 MeV',
	'p7': '>100 MeV',
	'p8': '>500 MeV'
} as const;
export const particlesOptions = Object.keys(PARTICLES);

const defaultParams = {
	showParticles: ['p7', 'p8', 'p8']
};

const colors = ['peach', 'cyan', 'green'];

export type SatPartParams = BasicPlotParams & Partial<typeof defaultParams>;

export function ParticlesPlotContextMenu() {

}

export default function ParticlesPlot({ params }: { params: SatPartParams }) {
	const { showParticles, showGrid, showTimeAxis } = { ...defaultParams, ...params };
	const { interval } = useSolarPlotContext();

	return (<BasicPlot {...{
		queryKey: ['satparticles', showParticles.join()],
		queryFn: () => basicDataQuery('omni/particles', interval, ['time', ...showParticles]),
		params: {
			...params,
			interval,
			onsets: [],
			clouds: [],
		},
		options: () => ({
			padding: [scaled(8), scaled(6), scaled(showTimeAxis ? 0 : 6), 0]
		}),
		axes: () => [{
			...axisDefaults(showGrid, (u, splits) => splits.map(s => Math.log10(s) % 1 === 0 ? s : null)),
			label: 'ions',
			fullLabel: 'IONS /cm²⋅s⋅sr',
			distr: 3,
			values: (u, vals) => vals.map(v => v <= 100 ? v : Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '')
		}],
		series: () => showParticles.map((part, i) => ({
			label: part,
			scale: 'ions',
			stroke: color(colors[i % colors.length], i >= colors.length ? .8 : 1),
			legend: `${part.at(0)}${PARTICLES[part as keyof typeof PARTICLES]}`,
		}))
	}}/>);
}