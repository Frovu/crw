import type { Onset, MagneticCloud } from '../../events/core/plot';
import type { EventsSettings } from '../../events/core/util';
import type { Shape } from './plotUtil';

export type ScaleParams = {
	min: number;
	max: number;
	bottom: number;
	top: number;
};

export type BasicPlotParams = {
	interval: [Date, Date];
	onsets?: Onset[];
	ends?: Onset[];
	clouds?: MagneticCloud[];
	interactive?: boolean;
	stretch?: boolean;
	showTimeAxis: boolean;
	showEventsEnds: boolean;
	showMetaLabels: boolean;
	showMetaInfo: boolean;
	showGrid: boolean;
	showMarkers: boolean;
	showLegend: boolean;
};

export const defaultPlotParams: Omit<BasicPlotParams, keyof EventsSettings | 'interval'> = {
	showMetaInfo: true,
	showMetaLabels: true,
	showTimeAxis: true,
};

export type CustomAxis = uPlot.Axis & {
	label: string;
	fullLabel?: string;
	position?: [number, number];
	minMax?: [number | null, number | null];
	showGrid?: boolean;
	whole?: boolean;
	distr?: number;
	_values?: (string | undefined)[];
	_splits?: number[];
};

export type CustomSeries = uPlot.Series & {
	legend?: string;
	marker?: Shape;
	bars?: boolean;
	myPaths?: (scl: number) => uPlot.Series['paths'];
};

export type CustomScale = uPlot.Scale & {
	scaleValue?: { min: number; max: number };
	positionValue?: { bottom: number; top: number };
};

export const textStyleTags = { b: 'bold', i: 'italic', sup: 'super', sub: 'sub' } as const;

export type TextNode = {
	text: string;
	styles: (typeof textStyleTags)[keyof typeof textStyleTags][];
};
