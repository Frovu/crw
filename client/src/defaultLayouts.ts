import type { Layout } from './layout';

export type LayoutPreset = {
	active: string,
	list: { [name: string]: Layout<{ [key: string]: any }> }
};

const feidDefaultLayouts: LayoutPreset = {
	active: 'overview',
	list: {
		overview: {
			tree: {
				root: {
					split: 'row',
					ratio: .4,
					children: ['left', 'right']
				},
				right: {
					split: 'column',
					ratio: .4,
					children: ['top', 'bottom']
				},
				top: {
					split: 'column',
					ratio: .6,
					children: ['p1', 'p2']
				},
				bottom: {
					split: 'column',
					ratio: .7,
					children: ['p3', 'p4']
				},
			},
			items: {
				left: {
					type: 'FEID Table',
					showAverages: true,
					showChangelog: false,
				},
				p1: {
					type: 'IMF + Speed'
				},
				p2: {
					type: 'SW Plasma',
					showTimeAxis: false,
				},
				p3: {
					type: 'Cosmic Rays',
					showAxyVector: true
				},
				p4: {
					type: 'Geomagn',
					showTimeAxis: false,
				}
			}
		},
		stats: {
			tree: {
				root: {
					split: 'column',
					ratio: .6,
					children: ['top', 'bottom']
				},
				top: {
					split: 'row',
					ratio: .66,
					children: ['topLeft', 'topR']
				},
				topR: {
					split: 'column',
					ratio: .2,
					children: ['topCorner', 'topRight']
				},
				bottom: {
					split: 'row',
					ratio: .66,
					children: ['row', 'bottomRight']
				},
				row: {
					split: 'row',
					ratio: .5,
					children: ['p1', 'p2']
				},
			},
			items: {
				topLeft: {
					type: 'FEID Table',
					showAverages: true,
					showChangelog: false,
				},
				p1: {
					type: 'Correlation'
				},
				p2: {
					type: 'Histogram',
				},
				bottomRight: {
					type: 'Events history',
				},
				topRight: {
					type: 'Superposed epochs',
				},
				topCorner: {
					type: 'Empty',
				},
			}
		},
		sources: {
			ignoreWhenCycling: true,
			tree: {
				root: {
					split: 'row',
					ratio: 0.7,
					children: [
						'column0',
						'column1'
					]
				},
				sources0: {
					split: 'row',
					ratio: 0.5,
					children: [
						'insertCtr',
						'cmes'
					]
				},
				column01top: {
					split: 'column',
					ratio: 0.5,
					children: [
						'column01top0',
						'column01top1'
					]
				},
				column01bottom: {
					split: 'row',
					ratio: 0.7,
					children: [
						'eruptions',
						'icmes'
					]
				},
				column0: {
					split: 'row',
					ratio: 0.6,
					children: [
						'column01',
						'columnPlots'
					]
				},
				column1: {
					split: 'column',
					ratio: 0.6,
					children: [
						'sdoSquare',
						'sunParams'
					]
				},
				sdoSquare: {
					split: 'row',
					ratio: 0.5,
					children: [
						'sdoCol0',
						'sdoCol1'
					]
				},
				sdoCol0: {
					split: 'column',
					ratio: 0.5,
					children: [
						'sdo0',
						'sdo1'
					]
				},
				sdoCol1: {
					split: 'column',
					ratio: 0.5,
					children: [
						'sdo2',
						'sdo3'
					]
				},
				sunParams: {
					split: 'column',
					ratio: 0.4,
					children: [
						'sunParams0',
						'sunParamsBottom'
					]
				},
				sunParamsBottom: {
					split: 'column',
					ratio: 0.4,
					children: [
						'sunParams1',
						'sunParams2'
					]
				},
				column01: {
					split: 'column',
					ratio: 0.8,
					children: [
						'column01top',
						'column01bottom'
					]
				},
				columnPlots: {
					split: 'column',
					ratio: 0.3,
					children: [
						'plots0',
						'plots1'
					]
				},
				plots0: {
					split: 'column',
					ratio: 0.6,
					children: [
						'plot0',
						'plot1'
					]
				},
				plots1: {
					split: 'column',
					ratio: 0.8,
					children: [
						'plots2',
						'plot4'
					]
				},
				plots2: {
					split: 'column',
					ratio: 0.5,
					children: [
						'plot2',
						'plot3'
					]
				},
				column01top1: {
					split: 'row',
					ratio: 0.7,
					children: [
						'sources0',
						'flares'
					]
				},
				column01top0: {
					split: 'row',
					ratio: 0.5,
					children: [
						'mainTable',
						'chSquare'
					]
				},
				chSquare: {
					split: 'column',
					ratio: 0.2,
					children: [
						'chTop',
						'chBottom'
					]
				},
				chBottom: {
					split: 'row',
					ratio: 0.44,
					children: [
						'chLeft',
						'chRight'
					]
				}
			},
			items: {
				sdo0: {
					type: 'Sun View',
					slave: true,
					src: 'AIA 193',
					frameTime: 50
				},
				sdo1: {
					type: 'Sun View',
					src: 'AIA 094',
					frameTime: 50
				},
				sdo2: {
					type: 'Sun View',
					showMetaLabels: false,
					showTimeAxis: false,
					mode: 'SDO',
					prefer: 'ANY',
					src: 'LASCO C2',
					slave: true
				},
				sdo3: {
					type: 'Sun View',
					slave: true,
					src: 'AIA 171',
					mode: 'SDO',
					frameTime: 60
				},
				sunParams0: {
					type: 'Particles',
					showMetaInfo: true,
					showTimeAxis: false,
					showMetaLabels: true,
					showParticles: [
						'p2',
						'p3',
						'p5',
						'p7'
					],
					solarTime: true
				},
				sunParams1: {
					type: 'CME Height'
				},
				sunParams2: {
					type: 'X-Rays',
					showShortXrays: true
				},
				plot0: {
					type: 'SW Plasma',
					showTimeAxis: false,
					showMetaLabels: false
				},
				plot1: {
					type: 'SW Types',
					showMetaLabels: false,
					showTimeAxis: false
				},
				plot4: {
					type: 'Geomagn',
					showTimeAxis: false,
					showMetaLabels: false
				},
				icmes: {
					type: 'ICME Table'
				},
				eruptions: {
					type: 'Erupt Src Table'
				},
				insertCtr: {
					type: 'Insert Controls'
				},
				cmes: {
					type: 'CME Table'
				},
				mainTable: {
					type: 'FEID Table',
					showChangelog: false,
					showAverages: false,
					hideHeader: false
				},
				flares: {
					type: 'Flares Table'
				},
				chTop: {
					type: 'Holes Src Table'
				},
				chLeft: {
					type: 'Solen Holes'
				},
				chRight: {
					type: 'Chimera Holes',
					frameTime: 400,
					slowFrameTime: 300,
					holesAnimation: true
				},
				plot2: {
					type: 'IMF + Speed'
				},
				plot3: {
					type: 'Cosmic Rays',
					showMetaLabels: true,
					showAxyVector: true
				}
			}
		},
		export: {
			ignoreWhenCycling: true,
			tree: {
				root: {
					split: 'row',
					ratio: .5,
					children: ['left', 'rightTwo']
				},
				left: {
					split: 'row',
					ratio: .5,
					children: ['leftTwo', 'previewAnd']
				},
				previewAnd: {
					split: 'column',
					ratio: .7,
					children: ['preview', 'colors']
				},
				leftTwo: {
					split: 'column',
					ratio: .4,
					children: ['tbl', 'exp']
				},
				rightTwo: {
					split: 'column',
					ratio: .9,
					children: ['right', 'empty']
				},
				right: {
					split: 'column',
					ratio: .4,
					children: ['top', 'bottom']
				},
				bottom: {
					split: 'column',
					ratio: .7,
					children: ['p3', 'p4']
				},
			},
			items: {
				tbl: {
					type: 'FEID Table',
					showAverages: false,
				},
				exp: {
					type: 'Export Controls'
				},
				colors: {
					type: 'Color Settings'
				},
				empty: {
					type: 'Empty',
				},
				preview: {
					type: 'Export Preview'
				},
				top: {
					type: 'IMF + Speed',
					showTimeAxis: false,
				},
				p3: {
					type: 'Cosmic Rays'
				},
				p4: {
					type: 'Geomagn',
					showTimeAxis: false,
				}
			}
		}
	}
};

export const defaultLayouts = {
	feid: feidDefaultLayouts
};