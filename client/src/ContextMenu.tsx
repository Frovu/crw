import { useContext, useState } from 'react';
import { LayoutContextMenu } from './Layout';
import { AuthContext, useContextMenu, closeContextMenu } from './app';
import { useLayoutsStore, type LayoutsMenuDetails } from './layout';
import { dispatchCustomEvent } from './util';
import { TextTransformContextMenu, type TextTransformMenuDetail } from './events/export/ExportPlot';
import { ExportMenu } from './events/export/ExportTable';

export default function ContextMenu() {
	const { resetLayout } = useLayoutsStore();
	const { role, promptLogin } = useContext(AuthContext);
	const { menu } = useContextMenu();
	const [div, setDiv] = useState<HTMLDivElement | null>(null);

	return !menu ? null : (
		<div
			ref={setDiv}
			className="ContextMenu"
			style={{
				left: Math.min(menu.x, document.body.offsetWidth - (div?.offsetWidth ?? 260)),
				top: Math.min(menu.y, document.body.offsetHeight - (div?.offsetHeight ?? 260)),
			}}
			onMouseDown={(e) => {
				e.stopPropagation();
			}}
			onClick={(e) => e.target instanceof HTMLButtonElement && closeContextMenu()}
		>
			{menu.type === 'app' && (
				<>
					{role && <button onClick={() => promptLogin('password')}>Change password</button>}
					{role === 'admin' && <button onClick={() => promptLogin('upsert')}>Upsert user</button>}
					<button onClick={() => resetLayout()}>Reset layout</button>
					<button onClick={() => dispatchCustomEvent('resetSettings')}>Reset all settings</button>
				</>
			)}
			{'tableExport' === menu.type && <ExportMenu />}
			{'textTransform' === menu.type && <TextTransformContextMenu detail={menu.detail as TextTransformMenuDetail} />}
			{['layout', 'events'].includes(menu.type) && <LayoutContextMenu detail={menu.detail as LayoutsMenuDetails} />}
		</div>
	);
}
