import { useCrowWindowDebounced } from '../core/crowSettings';

function Menu() {
	return <></>;
}

function Panel() {
	const { start, end } = useCrowWindowDebounced();

	return <div></div>;
}

export const OmniControls = {
	name: 'Omni Controls',
	Menu,
	Panel,
};
