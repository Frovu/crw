import uPlot from 'uplot';
import { color, font } from '../../plots/plotUtil';
import { useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import MinuteView from './MinuteView';
import { NeutronContext } from './Neutron';
import { NavigationContext, NavigatedPlot } from '../../plots/NavigatedPlot';

function plotOptions(stations: string[], levels: number[]) {
	const serColor = (u: any, idx: number) => {
		return u.series[idx].label === u._chosen ? (u.series[idx]._focus ? color('gold') : color('green')) : u.series[idx]._focus ? color('orange') : color('cyan');
	};
	const levelSize = levels[0] - levels[1];
	let mouseSelection = false;
	return {
		tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'UTC'),
		legend: { show: false },
		padding: [10, 12, 6, 0],
		cursor: {
			points: {
				size: 6,
				fill: color('acid'),
				stroke: color('acid')
			},
			focus: { prox: 32 },
			drag: { dist: 10 },
			bind: {
				dblclick: (u: any) => () => { u.cursor._lock = true; return null; },
				mousedown: (u, targ, handler) => {
					return e => {
						u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
						if (e.button === 0) {
							handler(e);
							if (!e.ctrlKey && !e.shiftKey) {
								mouseSelection = true;
							}
						}
						return null;
					};
				},
				mouseup: (u: any, targ, handler) => {
					return e => {
						if (e.button === 0) {
							if (mouseSelection) {
								u.cursor.drag.setScale = false;
								handler(e);
								u.cursor.drag.setScale = true;
								if (u.select?.width > 0)
									u.cursor._lock = false;
							} else {
								handler(e);
								u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, true);
							}
							mouseSelection = false;
							return null;
						}
					};
				}
			},
			lock: true
		},
		focus: {
			alpha: 1.1
		},
		scales: {
			y: {
				range: (u, min, max) =>  [Math.max(min, levels[levels.length-1] - 2*levelSize), Math.min(max, levels[0] + 2*levelSize)]
			}
		},
		axes: [
			{
				font: font(-2),
				stroke: color('text'),
				grid: { show: true, stroke: color('grid'), width: 2 },
				ticks: { stroke: color('grid'), width: 2 },
			},
			{
				splits: u => levels.map((lvl, i) => (((u.data[1 + i + levels.length][0] ?? lvl) + 2*lvl) / 3 + 2)),
				values: u => stations.map(s => s === (u as any)._prime ? s.toUpperCase() : s.toLowerCase()).map(s => s.slice(0, 4)),
				size: 36,
				gap: -6,
				font: font(-4),
				stroke: color('text'),
				grid: { show: true, stroke: color('grid'), width: 2 },
			}
		],
		series: [
			{ value: '{YYYY}-{MM}-{DD} {HH}:{mm}', stroke: color('text') } as any
		].concat(stations.map(s => ({
			label: s,
			width: 1,
			stroke: color('purple', .9),
			points: { show: true, size: 4, fill: color('purple', .5), stroke: color('purple', .4) },
		} as Partial<uPlot.Series>))).concat(stations.map(s => ({
			label: s,
			stroke: serColor,
			grid: { stroke: color('grid'), width: 1 },
			points: { fill: color('bg'), stroke: serColor },
		} as Partial<uPlot.Series>))).concat([{
			width: 3,
			stroke: color('red'),
			points: { show: true, size: 3, width: 1, fill: color('red') },
		}, {
			width: 3,
			stroke: color('magenta'),
			points: { show: true, size: 3, width: 1, fill: color('magenta') },
		}])
	} as Omit<uPlot.Options, 'height'|'width'>;
}

export function ManyStationsView({ legendContainer, detailsContainer }:
{ legendContainer: Element | null, detailsContainer: Element | null }) {
	const { data, plotData, stations, levels, showMinutes } = useContext(NeutronContext)!;
	const { state: { cursor, focused, chosen } } = useContext(NavigationContext);

	const chosenOrFocused = (chosen ?? focused)?.label;
	const legend = cursor && stations.map((st, i) => ({ name: st, value: data[1 + i][cursor.idx], focus: st === chosenOrFocused }));

	// eslint-disable-next-line react-hooks/exhaustive-deps
	const options = useCallback(() => plotOptions(stations, levels), [JSON.stringify(stations)]);

	return (<>
		<NavigatedPlot {...{ data: plotData, options, moveChosen: (inc, state) => {
			const foc = (state.chosen ?? state.focused)?.label;
			const cur = foc ? stations.indexOf(foc) : inc > 0 ? -1 : stations.length;
			const idx = Math.max(0, Math.min(cur + inc, stations.length - 1));
			return { ...state, chosen: { idx: idx + stations.length + 1, label: stations[idx] } };
		} }}/>
		{legendContainer && createPortal((
			<>
				{legend && <div style={{ display: 'grid', border: '2px var(--color-border) solid', padding: '2px 4px',
					gridTemplateColumns: 'repeat(3, 120px)' }}>
					{legend.map(({ name, value, focus }) =>
						<span key={name} style={{ color: color(focus ? 'magenta' : value == null ? 'text-dark' : 'text') }}>{name}={value == null ? 'N/A' : value.toFixed(1)}</span>)}
				</div>}
			</>
		), legendContainer)}
		{showMinutes && chosenOrFocused && cursor && detailsContainer && createPortal((
			<div style={{ position: 'relative', border: '2px var(--color-border) solid', width: 356, height: 240 }}>
				<MinuteView {...{ station: chosenOrFocused, timestamp: data[0][cursor.idx] }}/>
			</div>
		), detailsContainer)}
	</>);
}