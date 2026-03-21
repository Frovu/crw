import { useEventsContextMenu } from '../../app';
import { EventsTable } from './Table';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources } from '../core/eventsState';
import { linkSrcToEvent } from '../core/sourceActions';
import { withConfirmation } from '../../components/Confirmation';
import { deleteEvent, useTable } from '../core/editableTables';
import { Button } from '../../components/Button';

const ENT = 'sources_ch';

function Menu() {
	const { id: feidId } = useFeidCursor();
	const menu = useEventsContextMenu<'sources_ch'>();
	const sources = useCurrentFeidSources();
	const chsId = menu.event?.id;
	const isLinked = sources.find((src) => src.ch?.id === chsId);

	const del = () => withConfirmation('Delete CHS event?', 'Action is irreversible', () => deleteEvent(ENT, chsId!));

	return (
		chsId && (
			<>
				{feidId && !isLinked && <Button onClick={() => linkSrcToEvent(ENT, chsId, feidId)}>Link CHS</Button>}
				{feidId && isLinked && (
					<Button onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>Unlink CHS</Button>
				)}
				<Button onClick={del}>Delete row</Button>
			</>
		)
	);
}

function Panel() {
	const { start: cursorTime } = useFeidCursor();
	const { data, columns } = useTable(ENT);
	const feidSrc = useTable('feid_sources');
	const selectedCh = useSelectedSource(ENT);
	const sources = useCurrentFeidSources();

	if (!data.length) return <div className="center">LOADING..</div>;

	const focusTime = cursorTime && cursorTime.getTime() - 3 * 864e5;
	const focusIdxFound = selectedCh
		? data.findIndex((r) => selectedCh?.id === r[0])
		: focusTime == null
			? data.length
			: data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);
	const focusIdx = focusIdxFound < 0 ? data.length - 1 : focusIdxFound;

	return (
		<EventsTable
			{...{
				entity: ENT,
				data,
				columns,
				focusIdx,
				enableEditing: true,
				rowClassName: (row) => {
					const chId = row[0];
					const orphan = feidSrc.data.length && !feidSrc.data.find((r) => r[feidSrc.index.ch_id] === chId);
					if (orphan) return 'text-red';
					if (selectedCh?.id === chId) return 'text-cyan';
				},
			}}
		/>
	);
}

export const HolesTable = {
	name: 'Holes Src Table',
	Panel,
	Menu,
};
