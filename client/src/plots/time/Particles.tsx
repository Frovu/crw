import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, scaled, superScript } from '../plotUtil';
import { usePlot, useSolarPlot } from '../../events/core/plot';
import type { EventsPanel } from '../../events/core/util';
import { Checkbox } from '../../components/Checkbox';

const PARTICLES = {
	p1: '>1 MeV',
	p2: '>5 MeV',
	p3: '>10 MeV',
	p4: '>30 MeV',
	p5: '>50 MeV',
	p6: '>60 MeV',
	p7: '>100 MeV',
	p8: '>500 MeV',
	e1k: '80-115 keV',
	e2k: '115-165 keV',
	e3k: '165-235 keV',
	e4k: '235-340 keV',
	e5k: '340-500 keV',
	e6k: '500-700 keV',
	e7k: '700-1000 keV',
	e8k: '1000-1900 keV',
	e9k: '1900-3200 keV',
	e10k: '3200-6500 keV',
};
export const particlesOptions = Object.keys(PARTICLES);

const defaultParams = {
	solarTime: true,
	showParticles: ['p3', 'p5', 'p7'],
};

const colors = ['peach', 'cyan', 'green'];

export type SatPartParams = typeof defaultParams;

const name = (k: string) => `${k.at(0)} ${PARTICLES[k as keyof typeof PARTICLES]}`;

function Menu({ params, setParams }: ContextMenuProps<Partial<SatPartParams>>) {
	const { showParticles: show } = { ...defaultParams, ...params };
	const opts = particlesOptions;

	return (
		<div className="flex flex-wrap justify-end gap-0.5 w-80">
			{opts.map((part) => (
				<Checkbox
					className="pl-2"
					label={name(part)}
					checked={show.includes(part)}
					onCheckedChange={(val) =>
						setParams({
							showParticles: val
								? opts.filter((o) => show.includes(o) || o === part)
								: show.filter((o) => o !== part),
						})
					}
				/>
			))}
		</div>
	);
}

function Panel() {
	const params = usePlot<SatPartParams>();
	const { showParticles, showGrid, showTimeAxis, solarTime } = params;
	const para = { ...params };
	const { interval: sInterv } = useSolarPlot();
	const size = useContext(LayoutContext)?.size;
	if (solarTime) para.interval = sInterv;

	if (!solarTime && params.stretch && size?.width) {
		const padRight = 30;
		const inter = params.interval;
		const len = Math.ceil((inter[1].getTime() - inter[0].getTime()) / 36e5);
		const targetHourWidth = (size.width - 30) / len;
		const addHoursRight = Math.floor(padRight / targetHourWidth) - 1;
		para.interval = [inter[0], new Date(inter[1].getTime() + 36e5 * addHoursRight)];
	}

	return (
		<BasicPlot
			{...{
				queryKey: (interval) => ['satparticles', interval, showParticles],
				queryFn: (interval) =>
					showParticles.length
						? basicDataQuery('omni/particles', interval, ['time', ...showParticles])
						: (null as any),
				params: solarTime
					? {
							...para,
							onsets: [],
							clouds: [],
					  }
					: para,
				options: () => ({
					padding: [scaled(8), scaled(solarTime ? 6 : 36), scaled(showTimeAxis ? 0 : 6), 0],
				}),
				axes: () => [
					{
						...axisDefaults(showGrid, (u, splits) => splits.map((s) => (Math.log10(s) % 1 === 0 ? s : null))),
						label: 'ions',
						fullLabel: 'N / cm²⋅s⋅sr',
						distr: 3,
						values: (u, vals) =>
							vals.map((v) =>
								v <= 100 && v > 0.001 ? v : Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : ''
							),
					},
				],
				series: () =>
					showParticles.map((part, i) => ({
						label: part,
						scale: 'ions',
						stroke: color(colors[i % colors.length], i >= colors.length ? 0.8 : 1),
						legend: name(part),
					})),
			}}
		/>
	);
}

export const SatParticlesPlot: EventsPanel<SatPartParams> = {
	name: 'Particles',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
	isSolar: true,
};
