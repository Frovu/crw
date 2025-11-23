import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { type ContextMenuProps, LayoutContext, type LayoutContextType } from '../../layout';
import { apiGet } from '../../util';
import { equalValues, type EventsPanel } from '../core/util';
import { useEventsState, useSelectedSource } from '../core/eventsState';
import { useCompoundTable } from '../core/query';
import { getSourceLink } from '../core/sourceActions';
import { SimpleSelect } from '../../components/Select';

const ENLIL_OPTS = ['density', 'velocity'] as const;

const defaultParams = {
	variable: 'density' as (typeof ENLIL_OPTS)[number],
};

type Params = typeof defaultParams;

function Menu({ params, setParams }: ContextMenuProps<Params>) {
	return (
		<div className="flex gap-1 items-center">
			Param:
			<SimpleSelect
				value={params.variable}
				onChange={(variable) => setParams({ variable })}
				options={ENLIL_OPTS.map((v) => [v, v])}
			/>
		</div>
	);
}

function Panel() {
	const { params, size } = useContext(LayoutContext)! as LayoutContextType<Params>;
	const cmes = useCompoundTable('cme');
	const cursor = useEventsState((st) => st.cursor);
	const erupt = useSelectedSource('sources_erupt', true);

	const enlilId = (() => {
		if (cmes && cursor?.entity === 'cme') return cmes.entry(cmes.data[cursor.row]).enlil_id;
		if (!erupt || !cmes) return null;
		const link = getSourceLink('cme', 'DKI');
		const idColIdx = cmes.index[link.id]!;
		const found = erupt && cmes.data.find((row) => row[0] === 'DKI' && equalValues(row[idColIdx], erupt[link.link]));
		return found ? cmes.entry(found).enlil_id : null;
	})();

	const query = useQuery({
		queryKey: ['enlil', enlilId],
		queryFn: () => (enlilId == null ? null : apiGet<{ filename: string }>('events/enlil', { id: enlilId })),
	});

	const fname = query.data?.filename;
	const para = fname && (params.variable === 'density' ? 'tim-den' : 'tim-vel');
	const url = fname && `https://iswa.gsfc.nasa.gov/downloads/${fname}.${para}.gif`;
	const dkiurl = fname && `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/WSA-ENLIL/${enlilId}/-1`;

	return (
		<div onMouseDown={(e) => e.preventDefault()}>
			{query.isLoading && <div className="center">LOADING..</div>}
			{query.isError && <div className="center text-red">FAILED TO LOAD</div>}
			{query.isSuccess && (!enlilId || !url) && <div className="center">NO ENLIL MODEL</div>}
			{<img alt="" width={size.width} src={url} />}
			{url && (
				<div className="center bg-bg text-sm top-2 p-0.5">
					<a target="_blank" rel="noreferrer" href={dkiurl}>
						#{enlilId}
					</a>
					&nbsp;
					<a target="_blank" rel="noreferrer" href={url}>
						{para}.gif
					</a>
				</div>
			)}
		</div>
	);
}

export const ENLILView: EventsPanel<Params> = {
	name: 'ENLIL View',
	Menu,
	Panel,
	defaultParams,
};
