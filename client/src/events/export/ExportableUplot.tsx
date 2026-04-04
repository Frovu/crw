import { useContext, useEffect, useMemo, useState } from 'react';
import { withOverrides } from '../../plots/plotUtil';
import type { CustomScale } from '../../plots/basicPlot';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { LayoutContext, useNodeExists } from '../../app/layout';
import { type Size } from '../../util';
import { useAppSettings } from '../../app/app';
import { usePlotExportSate } from './exportablePlots';

export function ExportableUplot({
	size,
	options,
	data,
	onCreate,
}: {
	size?: (sz: Size, unknown: boolean) => Size;
	options: () => Omit<uPlot.Options, 'width' | 'height'>;
	data: (number | null)[][];
	onCreate?: (u: uPlot) => void;
}) {
	const layout = useContext(LayoutContext);
	const { theme, colors } = useAppSettings();
	const { scalesParams, textTransform } = usePlotExportSate((st) => st.overrides);
	const controlsPresent = useNodeExists('Export Controls');

	const [upl, setUpl] = useState<uPlot | null>(null);
	const borderSize = layout?.size
		? { width: layout?.size.width - 2, height: layout?.size.height - 2 }
		: { width: 600, height: 400 };
	const sz = size ? size(borderSize, !layout?.size) : borderSize;

	useEffect(() => {
		upl && upl.setSize(sz);
	}, [upl, sz.height, sz.width]); // eslint-disable-line

	const plot = useMemo(() => {
		const opts = !controlsPresent
			? options()
			: withOverrides(options, { scalesParams, textTransform: textTransform?.filter((tr) => tr.enabled) });
		return (
			<UplotReact
				{...{
					options: { ...sz, ...opts },
					data: data as any,
					onCreate: (u) => {
						if (layout?.id)
							queueMicrotask(() =>
								usePlotExportSate.setState((state) => {
									state.plots[layout.id] = { options, data, scales: {} };
									for (const scl in u.scales) {
										const { positionValue, scaleValue }: CustomScale = u.scales[scl];
										if (positionValue && scaleValue)
											state.plots[layout.id].scales[scl] = { ...positionValue, ...scaleValue };
									}
								}),
							);
						setUpl(u);
						onCreate?.(u);
					},
				}}
			/>
		);
	}, [theme, devicePixelRatio, colors, controlsPresent, options, scalesParams, textTransform, data, layout?.id, onCreate]); // eslint-disable-line
	return plot;
}
