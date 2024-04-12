import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { type PanelParams } from './events';
import { useQuery } from 'react-query';
import FlaresTable from './TableFlares';
import EruptionsTable from './TableEruptions';

const TABLES = ['Eruptions', 'Flares', 'CMEs', 'ICMEs', 'Dimmings'] as const;

const defaultParams = {
	secTable: 'Eruptions' as typeof TABLES[number]
};

export function SecTableContextMenu({ params, setParams }: ContextMenuProps<Partial<typeof defaultParams>>) {

	const para = { ...defaultParams, ...params };

	return <>
		<select value={para.secTable} onChange={e => setParams({ secTable: e.target.value as any })}
			style={{ border: 'transparent', textAlign: 'left' }}>
			{TABLES.map(t => <option key={t} value={t}>{t}</option>)}
		</select>
	</>;
}

export default function SecondaryTable() {
	const { params, size } = useContext(LayoutContext)!;
	const { secTable } = { ...defaultParams, ...params };

	if (secTable === 'Flares')
		return <FlaresTable/>;
	if (secTable === 'Eruptions')
		return <EruptionsTable/>;
	
	return null;
}