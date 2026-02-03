import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logMessage, logSuccess, logError } from '../../app';
import { apiPost, useEventListener } from '../../util';
import type { ComputationResponse, ComputedColumn } from '../../api';

export default function ComputeController() {
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

	const { mutate: computeRow } = useMutation({
		mutationFn: (rowId: number) => apiPost<ComputationResponse>('events/compute/row', { id: rowId }),
		onMutate: (rowId) => logMessage('Computing row #' + rowId.toString(), 'debug'),
		onSuccess: ({ time, done, error }, rowId) => {
			if (!done) return setTimeout(() => computeRow(rowId), 1000);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess(`Computed row #${rowId} in ${time} s`);
			if (error) logError(error);
		},
		onError: (err: any, rowId) => logError(`compute row #${rowId}: ` + err.toString()),
	});

	const { mutate: computeColumn } = useMutation({
		mutationFn: (column: ComputedColumn) => apiPost<ComputationResponse>('events/compute/column', { id: column.id }),
		onMutate: (column) => {
			logMessage('Computing ' + column.name, 'debug');
		},
		onSuccess: ({ time }, column) => {
			logSuccess(`Computed ${column.name} in ${time} s`);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
		},
		onError: (err: any, column) => {
			logError(`compute ${column.name}: ` + err.toString());
		},
	});

	useEventListener('computeRow', (e: CustomEvent<{ id: number }>) => computeRow(e.detail.id));
	useEventListener('computeAll', () => computeAll());
	useEventListener('computeColumn', (e: CustomEvent<{ column: ComputedColumn }>) => computeColumn(e.detail.column));

	return null;
}
