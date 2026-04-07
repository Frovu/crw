import { useState } from 'react';
import { useCrowWindowDebounced } from '../core/crowSettings';
import { omniGroups } from '../../api';

const groupOptions = ['<all>', ...omniGroups] as const;

function Menu() {
	return <></>;
}

function Panel() {
	const { start, end } = useCrowWindowDebounced();
	const [groupState, setGroup] = useState<(typeof groupOptions)[number]>('<all>');
	const groups = groupState === '<all>' ? omniGroups : [groupState];

	return <div></div>;
}

export const OmniControls = {
	name: 'Omni Controls',
	Menu,
	Panel,
};
