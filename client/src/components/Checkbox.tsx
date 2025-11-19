import type { ComponentProps } from 'react';
import { cn, type BoolKeys } from '../util';
import { useEventsSettings, type EventsSettings } from '../events/core/util';

export type CheckboxProps = {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
} & ComponentProps<'label'>;

export function Checkbox({ label, checked, onCheckedChange, ...props }: CheckboxProps) {
	const className = 'flex gap-1 items-center select-none cursor-pointer active:text-active/80 hover:text-active';
	return (
		<label {...props} className={cn(className, props.className)}>
			{label}
			<input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
		</label>
	);
}

export function EventsCheckbox({
	k,
	...props
}: { k: BoolKeys<EventsSettings> } & Omit<CheckboxProps, 'checked' | 'onCheckedChange'>) {
	const settings = useEventsSettings();
	return <Checkbox {...props} checked={settings[k]} onCheckedChange={(val) => settings.set(k, val)} />;
}
