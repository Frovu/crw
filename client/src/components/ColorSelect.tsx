import type { SelectProps } from '@radix-ui/react-select';
import { color, colorKeys, type Color } from '../app/app';
import { Select, SelectContent, SelectItem, SelectTrigger } from './Select';

const plotColors = colorKeys.slice(0, colorKeys.indexOf('crimson') + 1).filter((col) => !col.endsWith('2'));

type Props = Omit<SelectProps, 'value' | 'onChange'> & { value: Color; onChange: (val: Color) => void };

export default function ColorSelect({ value, onChange, ...props }: Props) {
	return (
		<Select {...props} value={value} onValueChange={onChange}>
			<SelectTrigger className="w-5 h-5 mr-1 rounded-xl" style={{ background: color(value) }} />
			<SelectContent side="top">
				{plotColors.map((col) => (
					<SelectItem key={col} value={col}>
						<div className="flex items-center gap-1">
							<div className="w-4 h-4" style={{ background: color(col) }} />
							{col}
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
