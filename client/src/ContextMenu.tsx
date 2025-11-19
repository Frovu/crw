import { useContext, useState } from 'react';
import { LayoutContextMenu } from './Layout';
import { AuthContext, useContextMenuStore, closeContextMenu } from './app';
import { useLayoutsStore, type LayoutsMenuDetails } from './layout';
import { dispatchCustomEvent } from './util';
import { TextTransformContextMenu, type TextTransformMenuDetail } from './events/export/ExportPlot';
import { ExportMenu } from './events/export/ExportTable';
import { Button } from './components/Button';

export default function ContextMenu() {
	const { resetLayout } = useLayoutsStore();
	const { role, promptLogin } = useContext(AuthContext);
	const { menu } = useContextMenuStore();
	const [div, setDiv] = useState<HTMLDivElement | null>(null);

	return !menu ? null : (
		<div
			ref={setDiv}
			className="fixed flex flex-col items-start p-2 border bg-bg text-sm z-5 [&>*]:w-full [&>*]:text-left [&_button]:border-none [&_button]:hover:text-active [&_button]:hover:underline"
			style={{
				left: Math.min(menu.x, document.body.offsetWidth - (div?.offsetWidth ?? 260)),
				top: Math.min(menu.y, document.body.offsetHeight - (div?.offsetHeight ?? 260)),
			}}
			onMouseDown={(e) => e.stopPropagation()}
			onClick={(e) => e.target instanceof HTMLButtonElement && closeContextMenu()}
		>
			{menu.type === 'app' && (
				<>
					{role && <Button onClick={() => promptLogin('password')}>Change password</Button>}
					{role === 'admin' && <Button onClick={() => promptLogin('upsert')}>Upsert user</Button>}
					<Button onClick={() => resetLayout()}>Reset layout</Button>
					<Button onClick={() => dispatchCustomEvent('resetSettings')}>Reset all settings</Button>
				</>
			)}
			{'tableExport' === menu.type && <ExportMenu />}
			{'textTransform' === menu.type && <TextTransformContextMenu detail={menu.detail as TextTransformMenuDetail} />}
			{['layout', 'events'].includes(menu.type) && <LayoutContextMenu detail={menu.detail as LayoutsMenuDetails} />}
		</div>
	);
}
