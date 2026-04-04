import { useState } from 'react';
import { openContextMenu } from '../../app/app';
import { Input } from '../../components/Input';
import { usePlotExportSate } from './exportablePlots';
import { Button, CloseButton } from '../../components/Button';
import { cn } from '../../util';
import { Checkbox } from '../../components/Checkbox';

const defaultTransform = () => ({
	search: '',
	replace: '',
	enabled: true,
	id: Date.now(),
});

export default function TextTransformsList() {
	const { overrides, set, setTransform, swapTransforms } = usePlotExportSate();
	const { textTransform } = overrides;
	const [dragging, setDragging] = useState<number | null>(null);

	const newTranform = () => set('textTransform', [defaultTransform()].concat(textTransform ?? []));
	const deleteTransform = (id: number) =>
		set(
			'textTransform',
			textTransform?.filter((t) => t.id !== id),
		);

	return (
		<div
			className="flex flex-col gap-0.5 p-[1px] pr-2"
			onMouseUp={() => setDragging(null)}
			onMouseLeave={() => setDragging(null)}
		>
			<div className="text-right flex flex-wrap max-w-100">
				<Button
					title="Load saved or public transforms (replace current)"
					className="grow text-skyblue px-4"
					onClick={openContextMenu('textTransform', { action: 'load' })}
				>
					<u>load</u>
				</Button>
				<Button
					disabled={!textTransform?.length}
					title="Save text transorms for future reuse or sharing"
					className="grow text-skyblue px-4"
					onClick={openContextMenu('textTransform', { action: 'save' })}
				>
					<u>save</u>
				</Button>
				<div title="Some characters, if thou mightst need em" className="text-dark tracking-[2px] select-text px-1">
					−+±×⋅·∙⋆°
				</div>
				<Button
					title="Replace text in labels via Regular Expressions which are applied to labels parts"
					className="grow text-skyblue px-4"
					onClick={newTranform}
				>
					+ <u>new replace</u>
				</Button>
			</div>
			{textTransform?.map(({ search, replace, id, enabled }) => (
				<div
					key={id}
					className={cn('flex flex-wrap items-center', !enabled && 'text-dark')}
					title="Drag to change replacements order"
					onMouseOver={(e) => {
						if (dragging && dragging !== id) swapTransforms(dragging, id);
					}}
					onMouseDown={(e) => !(e instanceof HTMLInputElement) && setDragging(id)}
				>
					<Checkbox
						label={enabled ? 'on' : 'off'}
						className="text-sm w-11 justify-end mr-2"
						checked={!!enabled}
						onCheckedChange={(chk) => setTransform(id, { enabled: chk })}
					/>
					<Input
						disabled={!enabled}
						className="grow shrink basis-20 min-w-20 max-w-36"
						placeholder="find"
						title="Dont forget to escape special characters with a \, like \(. Start with whitespace to target legend only."
						value={search}
						onChange={(e) => setTransform(id, { search: e.target.value })}
					/>
					<div className="cursor-grab px-1">-&gt;</div>
					<Input
						disabled={!enabled}
						className="grow shrink basis-36 min-w-20 max-w-60"
						placeholder="replace"
						title="Following tags are supported: <i> <b> <sup> <sub>"
						value={replace}
						onChange={(e) => setTransform(id, { replace: e.target.value })}
					/>
					<CloseButton onClick={() => deleteTransform(id)} />
				</div>
			))}
		</div>
	);
}
