import { useMemo, useState } from 'react';
import { color, colorKeys, getDefaultColor, themeOptions, useAppSettings, type Color } from './app';
import Sketch from '@uiw/react-color-sketch';
import { hexToHsva, hexToRgba, rgbaToHexa } from '@uiw/color-convert';
import { SimpleSelect } from '../components/Select';
import { Button } from '../components/Button';
import { cn } from '../util';

function Panel() {
	const [picking, setPicking] = useState<Color | null>(null);
	const old = useMemo(() => picking && color(picking), [picking]);
	const { theme, setTheme, setColor, resetColor, resetColors } = useAppSettings();

	return (
		<div className="h-full flex">
			<div className="w-[calc(100%-224px)] flex flex-col gap-1 p-1">
				<div className="flex flex-wrap gap-2">
					Theme:
					<SimpleSelect
						className="w-30"
						value={theme}
						onChange={setTheme}
						options={themeOptions.map((o) => [o, o])}
					/>
					<Button variant="default" className="px-2" onClick={() => resetColors()}>
						Reset colors
					</Button>
				</div>
				<div className="grow p-[1px] overflow-y-scroll grid grid-cols-[repeat(auto-fill,140px)] grid-rows-[repeat(auto-fill,1.5em)]">
					{colorKeys.map((col) => (
						<Button
							key={col}
							className={cn('flex items-center gap-1', col === picking && 'text-active underline')}
							onClick={() => setPicking(col)}
						>
							<div className="border h-4 w-8" style={{ backgroundColor: color(col) }}></div>
							{color(col) !== rgbaToHexa(getDefaultColor(col)) && <div className="text-magenta">*</div>}
							{col}
						</Button>
					))}
				</div>
			</div>
			{picking && old && (
				<div>
					<div className="flex text-sm text-center gap-2 py-1">
						<Button className="grow basis-1" onClick={() => resetColor(picking)}>
							default
							<div className="h-3.5" style={{ backgroundColor: rgbaToHexa(getDefaultColor(picking)) }} />
						</Button>
						<Button className="grow basis-1" onClick={() => setColor(picking, hexToRgba(old))}>
							old
							<div className="h-3.5" style={{ backgroundColor: old }} />
						</Button>
						<div className="grow basis-1">
							new
							<div className="h-3.5" style={{ backgroundColor: color(picking) }} />
						</div>
					</div>
					<Sketch color={hexToHsva(color(picking))} onChange={(col) => setColor(picking, col.rgba)} />
				</div>
			)}
		</div>
	);
}

export const ColorsSettings = {
	name: 'Colors Settings',
	Panel,
};
