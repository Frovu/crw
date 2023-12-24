import { useContext, useState } from 'react';
import { LayoutContextMenu } from './Layout';
import { AuthContext, useContextMenu, closeContextMenu } from './app';
import { ExportMenu } from './events/EventsData';
import { defaultLayouts } from './events/events';
import { useLayoutsStore, type LayoutsMenuDetails } from './layout';
import { dispatchCustomEvent } from './util';

export default function ContextMenu() {
	const { active, resetLayout } = useLayoutsStore();
	const { role, promptLogin } = useContext(AuthContext);
	const { menu } = useContextMenu();
	const [ div, setDiv ] = useState<HTMLDivElement|null>(null);
	
	return !menu ? null : <div ref={setDiv} className='ContextMenu'
		style={{ left: Math.min(menu.x, document.body.offsetWidth - (div?.offsetWidth ?? 260)),
				 top: Math.min(menu.y, document.body.offsetHeight - (div?.offsetHeight ?? 260)) }}
		onMouseDown={e => { e.stopPropagation(); }}
		onClick={e => (e.target instanceof HTMLButtonElement) && closeContextMenu()}>
		{menu.type === 'app' && <>
			{role && <button onClick={() => promptLogin('password')}>Change password</button>}
			{role === 'admin' && <button onClick={() => promptLogin('upsert')}>Upsert user</button>}
			{defaultLayouts[active] && <button onClick={() => resetLayout()}>Reset layout</button>}
			<button onClick={() => dispatchCustomEvent('resetSettings')}>Reset all settings</button>
		</>}
		{'tableExport' === menu.type && <ExportMenu/>}
		{['layout', 'events'].includes(menu.type) && <LayoutContextMenu detail={menu.detail as LayoutsMenuDetails}/>}
	</div>;
}