import { useState } from 'react';
import AppLayout, { LayoutItemParams, Size } from './Layout';

export function ContextMenuContent({ params }: { params: LayoutItemParams }) {

}

export function LayoutContent({ id, params }: { id: string, params: LayoutItemParams }) {
	const [cnt, setCnt] = useState(1);
	return <div style={{ height: '100%', backgroundColor: params.color, color: 'red', userSelect: 'none', fontSize: 20 }} onClick={() => setCnt(c => c + 1)}>
		<div className='Center'>{id} : {cnt}</div></div>;
}

export default function EventsApp() {
	return <AppLayout/>;
}