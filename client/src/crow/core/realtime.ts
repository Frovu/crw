import { useEffect } from 'react';
import { useCrowState } from './crowState';
import { useQueryClient } from '@tanstack/react-query';

export const useRealtimeUpdater = () => {
	const queryClient = useQueryClient();

	useEffect(() => {
		const interv = setInterval(() => {
			console.log('realtime invalidate');
			queryClient.invalidateQueries({ queryKey: ['plot'] });
			useCrowState.setState((state) => {
				state.realtimeHour = Math.ceil(new Date().getTime() / 36e5) * 3600;
			});
		}, 301 * 1000);
		return () => clearInterval(interv);
	}, [queryClient]);
};
