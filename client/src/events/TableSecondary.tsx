import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import FlaresTable, { FlaresContextMenu } from './TableFlares';
import EruptionsTable, { EruptionsContextMenu } from './TableEruptions';
import CMETable, { CMEContextMenu } from './TableCME';

const TABLES = ['Eruptions', 'Flares', 'CMEs', 'ICMEs', 'Dimmings'] as const;

const defaultParams = {
	secTable: 'Eruptions' as typeof TABLES[number]
};

export function SecTableContextMenu({ params, setParams }: ContextMenuProps<Partial<typeof defaultParams>>) {

	const { secTable } = { ...defaultParams, ...params };

	return <>
		<select value={secTable} onChange={e => setParams({ secTable: e.target.value as any })}
			style={{ border: 'transparent', textAlign: 'left' }}>
			{TABLES.map(t => <option key={t} value={t}>{t}</option>)}
		</select>
		<div className='separator'/>
		{secTable === 'Eruptions' && <EruptionsContextMenu/>}
		{secTable === 'Flares' && <FlaresContextMenu/>}
		{secTable === 'CMEs' && <CMEContextMenu/>}
	</>;
}

export default function SecondaryTable() {
	const { params } = useContext(LayoutContext)!;
	const { secTable } = { ...defaultParams, ...params };

	if (secTable === 'Flares')
		return <FlaresTable/>;
	if (secTable === 'Eruptions')
		return <EruptionsTable/>;
	if (secTable === 'CMEs')
		return <CMETable/>;
	
	return null;
}