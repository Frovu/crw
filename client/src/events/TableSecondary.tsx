import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { type PanelParams } from './events';
import { useQuery } from 'react-query';
import FlaresTable from './TableFlares';

const TABLES = ['Eruptive Events', 'Flares', 'CMEs', 'ICMEs', 'Dimmings'];

export function SecTableContextMenu({ params, setParams }: ContextMenuProps<PanelParams>) {

	return <>
		<select style={{ border: 'transparent', textAlign: 'left' }}>
			{TABLES.map(t => <option key={t} value={t}>{t}</option>)}
		</select>
	</>;
}


export default function SecondaryTable() {
	const { id: nodeId, params, size } = useContext(LayoutContext)!;

	const entity = 'solarsoft_flares';


	// if (query.error)
	// 	return <div className='Center'>FAILED TO LOAD</div>;
	// if (!query.data)
	// 	return null;

	return <FlaresTable/>;
}