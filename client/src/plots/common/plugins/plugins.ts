import { drawCustomLabels } from '../draw/drawCustomLabels';
import { drawCustomLegend } from '../draw/drawCustomLegend';
import { drawMagneticClouds } from '../draw/drawMagneticClouds';
import { drawOnsets } from '../draw/drawOnsets';
import type { BasicPlotParams, CustomScale } from '../types';

export function metainfoPlugin({
	params,
	truncate,
	under,
}: {
	params: BasicPlotParams;
	truncate?: (u: Omit<uPlot, 'scales'> & { scales: { [k: string]: CustomScale } }) => number;
	under?: boolean;
}): uPlot.Plugin {
	return {
		hooks: {
			drawAxes: [drawMagneticClouds(params, truncate)].concat(under ? drawOnsets(params, truncate) : []),
			draw: under ? [] : [drawOnsets(params, truncate)],
		},
	};
}

export function legendPlugin(para: Parameters<typeof drawCustomLegend>[0]): uPlot.Plugin {
	return {
		hooks: {
			ready: [para.overlayHandle.onReady],
			draw: [drawCustomLegend(para)],
		},
	};
}

export function labelsPlugin(para: Parameters<typeof drawCustomLabels>[0]): uPlot.Plugin {
	return {
		hooks: {
			draw: [drawCustomLabels(para)],
		},
	};
}
