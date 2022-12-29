import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { CorrParams, DataContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { pointPaths } from './plotPaths';
import { axisDefaults, color } from './plotUtil';

export default function CorrelationPlot() {
	const { options: { correlation: params } } = useContext(SettingsContext);
	const { columns } = useContext(TableContext);
	const { sample } = useContext(DataContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const plotOpts = useMemo(() => {
		const colIdx = ['columnX', 'columnY'].map(c => Object.keys(columns).indexOf(params[c as keyof CorrParams]));
		const data = sample.map(row => colIdx.map(i => row[i])).filter(r => r[0] != null).sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map(i => data.map(r => r[i]));

		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				mode: 2,
				padding: [10, 4, 0, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(),
						label: params.columnX,
						labelSize: 22,
						size: 30,
					},
					{
						...axisDefaults(),
						label: params.columnY,
						size: 56,
					},
				],
				scales: {
					x: {
						time: false
					},
					y: { 
					}
		
				},
				series: [
					null,
					{
						stroke: color(params.color),
						paths: pointPaths(4)
					},
				]
			} as uPlot.Options,
			data: [plotData, plotData] as any // UplotReact seems to not be aware of faceted plot mode
		}) ;
	}, [params, columns, sample]);

	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...plotOpts(size)}/>
	</div>);
}
