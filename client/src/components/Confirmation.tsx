import type { ReactNode } from 'react';
import { openConfirmation } from '../app/app';
import { useEventListener } from '../util';
import { Popup } from './Popup';
import { Button } from './Button';

export function Confirmation({
	children,
	callback,
	closeSelf,
}: {
	children: ReactNode;
	closeSelf: (positive?: boolean) => void;
	callback: () => void;
}) {
	useEventListener('click', () => closeSelf());
	useEventListener('escape', () => closeSelf());
	useEventListener('keydown', (e) => {
		if (e.code === 'KeyY') callback();
		closeSelf();
	});
	return (
		<Popup onClose={closeSelf} className="p-8 flex flex-col top-1/2 -translate-y-1/2 max-h-[calc(100vh-64px)]">
			{children}
			<div className="flex gap-4 justify-center pt-6 text-text">
				<Button
					variant="default"
					onClick={() => {
						callback();
						closeSelf(true);
					}}
				>
					Confirm (Y)
				</Button>
				<Button variant="default" onClick={() => closeSelf()}>
					Cancel (N)
				</Button>
			</div>
		</Popup>
	);
}

export function askConfirmation(head: string, body: string) {
	return new Promise<boolean>((resolve) => {
		setTimeout(
			() =>
				openConfirmation({
					content: (
						<>
							<h4>{head || 'Confirm action'}</h4>
							<p>{body}</p>
						</>
					),
					callback: () => resolve(true),
					onClose: () => resolve(false),
				}),
			20,
		);
	});
}

export async function withConfirmation(head: string, body: string, callback: () => void) {
	const conf = await askConfirmation(head, body);
	return conf && callback();
}
