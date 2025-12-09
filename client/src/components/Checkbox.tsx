import type { ComponentProps } from 'react';
import { cn, type BoolKeys } from '../util';
import { useEventsSettings, type EventsSettings } from '../events/core/util';

export type CheckboxProps = {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
} & ComponentProps<'label'>;

export function Checkbox({ label, checked, disabled, onCheckedChange, ...props }: CheckboxProps) {
	const className = 'flex gap-1 items-center select-none cursor-pointer active:text-active/80 hover:text-active';
	return (
		<label
			{...props}
			className={cn(className, disabled && 'text-dark hover:text-dark active:text-dark cursor-default', props.className)}
		>
			{label}
			<input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onCheckedChange(e.target.checked)} />
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
