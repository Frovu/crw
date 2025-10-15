import { useMemo, useState } from 'react';
import { color, colorKeys, getDefaultColor, themeOptions, useAppSettings } from './app';
import Sketch from '@uiw/react-color-sketch';
import { hexToHsva, hexToRgba, rgbaToHexa } from '@uiw/color-convert';

function Panel() {
	const [picking, setPicking] = useState<string | null>(null);
	const old = useMemo(() => picking && color(picking), [picking]);
	const { theme, setTheme, setColor, resetColor, resetColors } = useAppSettings();

	return (
		<div style={{ height: '100%', width: '100%', display: 'flex' }}>
			<div style={{ width: 'calc(100% - 224px)', display: 'flex', gap: 4, flexDirection: 'column', padding: '4px 8px' }}>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					<label>
						Theme:
						<select style={{ padding: 0 }} value={theme} onChange={(e) => setTheme(e.target.value as any)}>
							{themeOptions.map((opt) => (
								<option key={opt} value={opt}>
									{opt}
								</option>
							))}
						</select>
					</label>
					<button style={{ padding: '0 8px' }} onClick={() => resetColors()}>
						Reset colors
					</button>
				</div>
				<div
					style={{
						flexGrow: 1,
						overflowY: 'scroll',
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, 140px)',
						gridTemplateRows: 'repeat(auto-fill, 1.5em)',
					}}
				>
					{colorKeys.map((col) => (
						<div
							key={col}
							style={{
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 4,
								width: 'fit-content',
								padding: 4,
								...(col === picking && { color: 'var(--color-active)', textDecoration: 'underline' }),
							}}
							onClick={() => setPicking(col)}
						>
							<div
								style={{
									display: 'inline-block',
									border: '1px solid var(--color-grid)',
									height: '1em',
									width: '2em',
									backgroundColor: color(col),
								}}
							></div>
							{color(col) !== rgbaToHexa(getDefaultColor(col)) ? '*' : ''}
							{col}
						</div>
					))}
				</div>
			</div>
			{picking && old && (
				<div style={{ overflow: 'auto', marginRight: 6 }}>
					<div style={{ display: 'flex', textAlign: 'center', padding: '4px 10px 0 10px', fontSize: 12, gap: 4 }}>
						<div style={{ flex: '1 1px', cursor: 'pointer' }} onClick={() => resetColor(picking)}>
							default
							<div style={{ backgroundColor: rgbaToHexa(getDefaultColor(picking)), height: 14, width: '100%' }} />
						</div>
						<div style={{ flex: '1 1px', cursor: 'pointer' }} onClick={() => setColor(picking, hexToRgba(old))}>
							old
							<div style={{ backgroundColor: old, height: 14, width: '100%' }} />
						</div>
						<div style={{ flex: '1 1px' }}>
							new
							<div style={{ backgroundColor: color(picking), height: 14, width: '100%' }} />
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
