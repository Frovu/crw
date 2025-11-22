import { useState } from 'react';
import { getApp, KEY_COMB } from './app';
import { Button, CloseButton } from './components/Button';
import { defaultLayouts } from './defaultLayouts';
import { useLayoutsStore } from './layout';
import { cn, useEventListener } from './util';
import { Input } from './components/Input';
import { Checkbox } from './components/Checkbox';
import { SimpleSelect } from './components/Select';

export function LayoutNav() {
	const { apps, selectLayout, copyLayout, renameLayout, deleteLayout, toggleCycling } = useLayoutsStore();
	const { list, active } = apps[getApp()] ?? { list: {}, active: '' };
	const [hovered, setHovered] = useState<0 | 1 | 2>(0);
	const [renaming, setRenaming] = useState<{ layout: string; input: string } | null>(null);
	const [open, setOpen] = useState(false);
	const layouts = Object.keys(list);

	const cycleLayouts = (idx: number): any => {
		const next = (idx + 1) % layouts.length;
		if (!list[layouts[next]].ignoreWhenCycling || layouts[next] === active) {
			return selectLayout(layouts[next]);
		}
		return cycleLayouts(next);
	};

	useEventListener('click', () => {
		setOpen(false);
		setRenaming(null);
	});
	useEventListener('contextmenu', () => {
		setOpen(false);
		setRenaming(null);
	});
	useEventListener('action+switchLayout', () => cycleLayouts(layouts.indexOf(active)));

	const defaultL = defaultLayouts[getApp() as keyof typeof defaultLayouts]?.list;

	return (
		<div
			className="relative flex items-center text-dark p-1"
			onMouseEnter={() => setHovered(1)}
			onMouseLeave={() => setHovered(0)}
		>
			{open && (
				<div
					className="absolute flex flex-col items-end -left-1 bottom-[calc(100%-2px)] bg-bg p-1 border"
					onClick={(e) => e.stopPropagation()}
				>
					{layouts.map((layout) => {
						const isDefault = defaultL[layout];
						const isActive = active === layout;
						return (
							<div key={layout} className="flex gap-3 items-center">
								{renaming?.layout === layout ? (
									<Input
										className="w-20"
										type="text"
										autoFocus
										onFocus={(e) => e.target.select()}
										onKeyDown={(e) =>
											['Enter', 'NumpadEnter'].includes(e.code) && (e.target as any).blur?.()
										}
										onBlur={() => {
											renameLayout(renaming.layout, renaming.input);
											setRenaming(null);
										}}
										value={renaming.input}
										onChange={(e) => setRenaming({ ...renaming, input: e.target.value })}
									/>
								) : (
									<div
										className={cn(
											'cursor-pointer',
											isActive ? 'text-active' : isDefault ? 'text-text' : null
										)}
										onClick={() => selectLayout(layout)}
									>
										{layout}
									</div>
								)}
								<Button
									hidden={!!isDefault}
									className="TextButton"
									onClick={() => setRenaming({ layout, input: layout })}
								>
									rename
								</Button>
								<Button className="TextButton" onClick={() => copyLayout(layout)}>
									copy
								</Button>
								<Checkbox
									title={`Cycle with ${KEY_COMB.switchLayout} key`}
									label="cycle"
									checked={!list[layout].ignoreWhenCycling}
									onCheckedChange={(val) => toggleCycling(layout, !val)}
								/>
								{!isDefault ? <CloseButton onClick={() => deleteLayout(layout)} /> : <div className="w-4" />}
							</div>
						);
					})}
				</div>
			)}
			<div
				className={cn('cursor-pointer', (open || hovered > 1) && 'text-active', !open && hovered > 0 && 'underline')}
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				onMouseEnter={() => setHovered(2)}
				onMouseLeave={() => setHovered(1)}
			>
				{open || hovered > 0 ? 'manage' : 'layout'}
			</div>
			:
			<SimpleSelect
				className="h-5"
				options={Object.keys(list).map((l) => [l, l])}
				value={active}
				onChange={(val) => selectLayout(val)}
			/>
		</div>
	);
}
