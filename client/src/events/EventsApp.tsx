import { useState } from 'react';
import AppLayout, { LayoutItemParams, Size } from './Layout';

export function ContextMenuContent({ params, setParams }: { params: LayoutItemParams, setParams: (p: Partial<LayoutItemParams>) => void }) {
	return <>
		<label><select value={params.color} onChange={e => setParams({ color: e.target.value })}>
			{['blue', 'orange', 'green'].map(cl => <option key={cl} value={cl}>{cl}</option>)}
		</select></label>
	</>;
}

export function LayoutContent({ id, params }: { id: string, params: LayoutItemParams }) {
	return <div style={{ height: '100%', backgroundColor: params.color, color: 'red', userSelect: 'none', fontSize: 20 }}>
		<div className='Center'>{id}</div></div>;
}

export default function EventsApp() {
	return <AppLayout/>;
}