import { useContext } from 'react';
import { cn } from '../../util';
import { sourceLinks } from '../../api';
import { openContextMenu } from '../../app';
import { LayoutContext } from '../../layout';
import { useCurrentFeidSources, useEventsState, type FeidSource } from '../core/eventsState';
import { getTable, makeChange } from '../core/editableTables';
import { Button } from '../../components/Button';

const INFL_COL = 'cr_influence';

const cycleInfl = (src: FeidSource, dir: -1 | 1) => {
	const opts = getTable('feid_sources').columns?.find((c) => c.sql_name === INFL_COL)?.enum ?? [];
	const value = opts[(opts.length + opts.indexOf(src.source.cr_influence as any) + dir) % opts.length];
	makeChange('feid_sources', { column: INFL_COL, value, id: src.source.id, fast: true });
};

const inflColor = (src: FeidSource) => {
	const infl = src.source[INFL_COL];
	if (!infl) return 'text-red';
	return { primary: 'text-green', secondary: 'text-text', residual: 'text-dark' }[infl];
};

function InflButton({ src }: { src: FeidSource }) {
	return (
		<td
			className={cn('min-w-[80px]', inflColor(src))}
			onContextMenu={(e) => {
				e.stopPropagation();
				e.preventDefault();
				cycleInfl(src, -1);
			}}
			onClick={(e) => {
				e.stopPropagation();
				cycleInfl(src, 1);
			}}
			onWheel={(e) => cycleInfl(src, e.deltaY > 0 ? 1 : -1)}
		>
			<Button className="w-full">{src.source[INFL_COL] ?? 'Infl: N/A'}</Button>
		</td>
	);
}

export default function SourcesList() {
	const { id: nodeId } = useContext(LayoutContext)!;
	const modifySourceId = useEventsState((st) => st.modifySourceId);
	const setModifySource = useEventsState((st) => st.setModifySource);
	const sources = useCurrentFeidSources();

	const errNoPrimary = !sources.find((s) => s.source.cr_influence === 'primary');

	return (
		<div className="flex flex-col pt-[1px]">
			{sources.map((src, i) => {
				const srcId = src.source.id;
				const isActive = srcId === modifySourceId;

				const clr = (what: keyof typeof sourceLinks | 'chimera') => {
					const isSet =
						what === 'chimera' ? src.ch?.chimera_id : (src.erupt ?? (src.ch as any))?.[sourceLinks[what][1]];
					return cn(isSet && 'text-green bg-green/20');
				};

				return (
					<div
						key={srcId}
						title={'id=' + src.source.id}
						onContextMenu={openContextMenu('events', { nodeId, ...(src as any) })}
						className={cn('border border-bg w-full max-w-72 cursor-pointer', isActive && 'border-active')}
						onClick={() => setModifySource(isActive ? null : srcId)}
					>
						<table className="[&_td]:border w-full">
							<tbody>
								{src.ch && (
									<tr>
										<td width={64} className="text-dark">
											{(src.ch?.tag as string) ?? `CH#${i + 1}`}
										</td>
										<InflButton src={src} />
										<td width={60} className={clr('solen_holes')}>
											SOLEN
										</td>
										<td width={60} className={clr('chimera')}>
											CHIMR
										</td>
									</tr>
								)}
								{src.erupt && (
									<tr>
										<td width={84} className="text-dark">
											ERU{i + 1}
										</td>
										<td width={40} className="border-b-bg text-dark text-right">
											FLR:
										</td>
										<td width={36} className={clr('solarsoft_flares')}>
											SFT
										</td>
										<td width={36} className={clr('donki_flares')}>
											DKI
										</td>
										<td width={36} className={clr('legacy_noaa_flares')}>
											NOA
										</td>
										<td width={36}></td>
									</tr>
								)}
								{src.erupt && (
									<tr>
										<InflButton src={src} />

										<td className="text-right text-dark">CME:</td>
										<td className={clr('lasco_cmes')}>LSC</td>
										<td className={clr('donki_cmes')}>DKI</td>
										<td className={clr('cactus_cmes')}>CCT</td>
										<td className={clr('r_c_icmes')}>R&C</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				);
			})}
			<pre className="m-0 text-red">{errNoPrimary && 'no primary source\n'}</pre>
		</div>
	);
}
