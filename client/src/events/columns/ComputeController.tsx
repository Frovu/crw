import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logMessage, logSuccess, logError } from '../../app/app';
import { apiPost, useEventListener } from '../../util';
import type { Column, ComputationResponse, ComputedColumn } from '../../api';
import { useTable } from '../core/editableTables';

const COMPUTE_ROWS_MARGIN = 2;

export default function ComputeController() {
	const { data } = useTable('feid');
	const queryClient = useQueryClient();

	const { mutate: computeAll } = useMutation({
		mutationFn: () => apiPost<ComputationResponse>('events/compute/all'),
		onMutate: () => logMessage('Computing everything...', 'debug'),
		onSuccess: ({ time, done, error }) => {
			if (!done) return setTimeout(() => computeAll(), 1000);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess(`Computed everything in ${time} s`);
			if (error) logError(error);
		},
		onError: (err: any) => logError('compute all: ' + err.toString()),
	});

	const { mutate: computeRows } = useMutation({
		mutationFn: (ids: number[]) => apiPost<ComputationResponse>('events/compute/rows', { ids }),
		onMutate: (ids) => logMessage(`Computing rows #${ids.at(0)}-${ids.at(-1)}`, 'debug'),
		onSuccess: ({ time, error }, ids) => {
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess(`Computed rows #${ids.at(0)}-${ids.at(-1)} in ${time} s`);
			if (error) logError(`Errors in rows #${ids.at(0)}-${ids.at(-1)}:\n` + error);
		},
		onError: (err: any, ids) => logError(`compute rows #${ids.at(0)}-${ids.at(-1)}: ` + err.toString()),
	});

	const { mutate: computeColumn } = useMutation({
		mutationFn: (column: Column) => apiPost<ComputationResponse>('events/compute/column/' + column.sql_name),
		onMutate: (column) => {
			logMessage('Computing ' + column.name, 'debug');
		},
		onSuccess: ({ time, error }, column) => {
			if (error) return logError(`compute ${column.name}: ` + error);

			logSuccess(`Computed ${column.name} in ${time} s`);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
		},
		onError: (err: any, column) => {
			logError(`compute ${column.name}: ` + err.toString());
		},
	});

	useEventListener('computeRowsNear', (e: CustomEvent<{ id: number }>) => {
		const targetId = e.detail.id;
		const targetIdx = data.findIndex((r) => r[0] === targetId);
		if (targetIdx < 0) return logError(`Row #${targetId} not found`);

		const sliceFrom = Math.max(0, targetIdx - COMPUTE_ROWS_MARGIN);
		const sliceTo = targetIdx + COMPUTE_ROWS_MARGIN + 1;
		const computeIds = data.slice(sliceFrom, sliceTo).map((r) => r[0]);
		computeRows(computeIds);
	});
	useEventListener('computeAll', () => computeAll());
	useEventListener('computeColumn', (e: CustomEvent<{ column: Column }>) => computeColumn(e.detail.column));

	return null;
}
