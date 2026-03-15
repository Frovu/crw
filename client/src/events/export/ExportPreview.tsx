import { useContext, useState, useEffect } from 'react';
import { Checkbox } from '../../components/Checkbox';
import { LayoutContext } from '../../layout';
import type { EventsPanel } from '../core/util';
import { usePlotExportSate, computePlotsLayout, renderPlotsInCanvas } from './exportablePlots';

function PreviewPanel() {
	const expState = usePlotExportSate();
	const { scale } = expState.overrides;
	const context = useContext(LayoutContext)!;
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [show, setShow] = useState(false);
	const [renderTime, setTime] = useState<number | null>(null);

	const width = show ? computePlotsLayout().width : 1;

	useEffect(() => {
		if (!show || !container) return;
		const time = Date.now();
		renderPlotsInCanvas().then((can) => {
			container?.replaceChildren(can);
			setTime(Date.now() - time);
		});
	}, [container, context, show, expState]);

	return (
		<div className="h-full pb-1" onClick={() => setShow(!show)}>
			<Checkbox
				className="pl-1"
				label="preview plots (may be slow)"
				checked={show}
				readOnly
				onClick={(e) => e.preventDefault()}
			/>
			{show && renderTime && (
				<div className="absolute text-dark z-2 bg-bg bottom-1 right-1 text-sm">
					Rendered in {renderTime.toFixed()} ms
				</div>
			)}
			<div
				ref={setContainer}
				hidden={!show}
				style={{
					transform: `scale(${(context.size.width - 4) / width / scale})`,
					transformOrigin: 'top left',
				}}
			/>
		</div>
	);
}

export const ExportPreview: EventsPanel<{}> = {
	name: 'Export Preview',
	Panel: PreviewPanel,
};
