import { useQuery } from 'react-query';

function DataWrapper({ tables }: { tables: any }) {
	const query = useQuery(['tableData'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/forbush/`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		const data = await res.json();
	});
	return (
		<div className="">

		</div>
	);
}

export default function TableWrapper() {
	const query = useQuery(['tableStructure'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/forbush/info/`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.json();
	});
	return <DataWrapper tables={query.data}/>;
}