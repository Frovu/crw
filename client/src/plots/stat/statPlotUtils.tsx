import type { Sample } from '../../api';
import { useFeidSample } from '../../events/core/feid';

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
