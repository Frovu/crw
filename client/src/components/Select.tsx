'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '../util';
import { ChevronDown, ChevronsUpDown, ChevronUp, SunDim } from 'lucide-react';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Trigger
		ref={ref}
		className={cn(
			'flex [&>:first-child]:grow [&>:first-child]:px-1 pl-1 h-6 cursor-pointer hover:text-active w-full items-center justify-between whitespace-nowrap ring-offset-background placeholder:text-dark focus:outline-hidden focus:ring-1 focus:ring-active disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
			className
		)}
		{...props}
	>
		{children}

		<SelectPrimitive.Icon asChild>
			<ChevronsUpDown className="h-4 w-4 opacity-50" />
		</SelectPrimitive.Icon>
	</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollUpButton
		ref={ref}
		className={cn('flex cursor-default items-center justify-center py-1', className)}
		{...props}
	>
		<ChevronUp className="h-4 w-4 opacity-50" />
	</SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollDownButton
		ref={ref}
		className={cn('flex cursor-default items-center justify-center py-1', className)}
		{...props}
	>
		<ChevronDown className="h-4 w-4 opacity-50" />
	</SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> &
		React.ComponentPropsWithoutRef<typeof SelectPrimitive.Portal>
>(({ className, children, position = 'popper', container, ...props }, ref) => (
	<SelectPrimitive.Portal container={container}>
		<SelectPrimitive.Content
			ref={ref}
			className={cn(
				'relative max-h-96 min-w-[8rem] overflow-hidden border bg-bg shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
				position === 'popper' &&
					'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
				className
			)}
			style={{ zIndex: 2147483647 }}
			position={position}
			{...props}
		>
			<SelectScrollUpButton />
			<SelectPrimitive.Viewport
				className={cn(
					'p-1',
					position === 'popper' && 'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)'
				)}
			>
				{children}
			</SelectPrimitive.Viewport>
			<SelectScrollDownButton />
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Label>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item
		ref={ref}
		className={cn(
			'relative flex w-full cursor-pointer text-sm py-1 pl-2 pr-8 hover:text-active select-none items-center outline-hidden focus:text-active data-disabled:pointer-events-none data-disabled:opacity-50',
			className
		)}
		{...props}
	>
		<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center text-active">
			<SelectPrimitive.ItemIndicator>
				<SunDim size={20} />
			</SelectPrimitive.ItemIndicator>
		</span>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

type SimpleSelectProps<T> = {
	placeholder?: string;
	options: [T, string][];
	value?: T;
	onChange: (val: T) => void;
} & Omit<React.ComponentProps<'button'>, 'value' | 'onChange'>;
const SimpleSelect = <T extends any>({ placeholder, options, value, onChange, ...props }: SimpleSelectProps<T>) => {
	return (
		<Select
			value={options.find(([val]) => val === value)?.[1] ?? ''}
			onValueChange={(label) => onChange(options.find(([, lbl]) => lbl === label)![0])}
		>
			<SelectTrigger {...props}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent side="top">
				{options.map(([, lbl]) => (
					<SelectItem key={lbl} value={lbl}>
						{lbl}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};

export {
	SimpleSelect,
	Select,
	SelectGroup,
	SelectValue,
	SelectTrigger,
	SelectContent,
	SelectLabel,
	SelectItem,
	SelectSeparator,
	SelectScrollUpButton,
	SelectScrollDownButton,
};
