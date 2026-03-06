import type { Column, Sample } from '../../api';
import { useFeidSample, useFeidTableView } from '../../events/core/feid';

export type SampleOption = '<current>' | '<none>' | number;

export const sampleOptions = (samples?: Sample[]) =>
	[['<none>', '<none>'], ['<current>', '<current>'], ...(samples?.map(({ id, name }) => [id, name]) ?? [])] as [
		SampleOption,
		string,
	][];

export function useSampleOptions() {
	const { samples } = useFeidSample();
	return sampleOptions(samples);
}

export function useColumnOptions(dtypes: Column['dtype'][], addNames?: (string | null)[]) {
	const { columns } = useFeidTableView();

	return columns.filter((col) => ['integer', 'real'].includes(col.dtype) || addNames?.includes(col.sql_name));
}
