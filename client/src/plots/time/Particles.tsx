import type { ContextMenuProps } from '../../layout';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, scaled, superScript } from '../plotUtil';
import { useSolarPlotContext } from './solar';

const PARTICLES = {
	'p1': '>1 MeV',
	'p2': '>5 MeV',
	'p3': '>10 MeV',
	'p4': '>30 MeV',
	'p5': '>50 MeV',
	'p6': '>60 MeV',
	'p7': '>100 MeV',
	'p8': '>500 MeV',
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
};
export const particlesOptions = Object.keys(PARTICLES);

const defaultParams = {
	showParticles: ['p7', 'p8', 'p8']
};

const colors = ['peach', 'cyan', 'green'];

export type SatPartParams = BasicPlotParams & Partial<typeof defaultParams>;

const name = (k: string) => `${k.at(0)} ${PARTICLES[k as keyof typeof PARTICLES]}`;

export function ParticlesPlotContextMenu({ params, setParams }: ContextMenuProps<Partial<SatPartParams>>) {
	const { showParticles: show } = { ...defaultParams, ...params };
	const opts = particlesOptions;

	return <>
		<div className='separator'/>
		<div style={{ display: 'flex', flexFlow: 'row wrap', maxWidth: 320, justifyContent: 'right', marginTop: -4 }}>
			{opts.map(part => <div key={part}>
				<label style={{ padding: '0 4px' }}>
					{name(part)}<input type='checkbox' style={{ marginLeft: 6 }} checked={show.includes(part)}
						onChange={e => setParams({ showParticles: e.target.checked ?
							opts.filter(o => show.includes(o) || o === part) : show.filter(o => o !== part) })}/></label>
			</div>)}
		</div></>;
}

export default function ParticlesPlot({ params }: { params: SatPartParams }) {
	const { showParticles, showGrid, showTimeAxis } = { ...defaultParams, ...params };
	const { interval } = useSolarPlotContext();

	return (<BasicPlot {...{
		queryKey: ['satparticles', showParticles.join()],
		queryFn: () => showParticles.length ? basicDataQuery('omni/particles', interval, ['time', ...showParticles]) : null as any,
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
			fullLabel: 'N / cm²⋅s⋅sr',
			distr: 3,
			values: (u, vals) => vals.map(v => v <= 100 && v > .001 ? v : Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '')
		}],
		series: () => showParticles.map((part, i) => ({
			label: part,
			scale: 'ions',
			stroke: color(colors[i % colors.length], i >= colors.length ? .8 : 1),
			legend: name(part),
		}))
	}}/>);
}