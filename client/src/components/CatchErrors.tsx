import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

export function CatchErrors({ children }: { children: ReactNode }) {
	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<div
					className="w-full h-full"
					onMouseEnter={() => resetErrorBoundary()}
					onMouseLeave={() => resetErrorBoundary()}
				>
					<div className="center text-red">ERROR: {error.message}</div>
				</div>
			)}
		>
			{children}
		</ErrorBoundary>
	);
}
