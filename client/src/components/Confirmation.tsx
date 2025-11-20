import type { ReactNode } from 'react';
import { openConfirmation } from '../app';
import { useEventListener } from '../util';

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
		<>
			<div className="PopupBackground" />
			<div
				className="Popup Confirmation"
				style={{ zIndex: 130, left: '30vw', top: '20vh', maxWidth: 560 }}
				onClick={(e) => e.stopPropagation()}
			>
				{children}
				<div style={{ marginTop: '1em' }}>
					<button
						style={{ width: '8em' }}
						onClick={() => {
							callback();
							closeSelf(true);
						}}
					>
						Confirm (Y)
					</button>
					<button style={{ width: '8em', marginLeft: '24px' }} onClick={() => closeSelf()}>
						Cancel (N)
					</button>
				</div>
			</div>
		</>
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
			20
		);
	});
}

export async function withConfirmation(head: string, body: string, callback: () => void) {
	const conf = await askConfirmation(head, body);
	return conf && callback();
}
