import AppLayout, { LayoutItemParams, Size } from './Layout';

export function LayoutContent({ params, size }: { params: LayoutItemParams, size: Size }) {
	return <div style={{ ...size, backgroundColor: params.color }}></div>;
}

export default function EventsApp() {
	return <AppLayout/>
}