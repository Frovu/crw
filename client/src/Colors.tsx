import { useState } from 'react';
import { RGBToString, colorKeys, getDefaultColor, themeOptions, useAppSettings } from './app';
import { Sketch, rgbaToHsva } from '@uiw/react-color';

export function ColorsSettings() {
	const [picking, setPicking] = useState<string>('bg');
	const { theme, setTheme } = useAppSettings();
	
	return <div style={{ height: '100%', width: '100%', display: 'flex' }}>
		<div style={{ width: 'calc(100% - 218px)', display: 'flex', gap: 4, flexDirection: 'column', padding: '4px 8px' }}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
				<label>Theme:<select style={{ padding: 0 }} value={theme} onChange={e => setTheme(e.target.value as any)}>
					{themeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
				</select></label>
				<button style={{ padding: '0 8px' }}>Reset colors</button>
			</div>
			<div style={{ flexGrow: 1, overflowY: 'scroll',
				display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 140px)', gridTemplateRows: 'repeat(auto-fill, 1.5em)' }}>
				{colorKeys.map(col => <div key={col} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
					width: 'fit-content', padding: 4, ...(col === picking && { color: 'var(--color-active)', textDecoration: 'underline' }) }}
				onClick={() => setPicking(col)}>
					<div style={{ display: 'inline-block', border: '1px solid var(--color-grid)', height: '1em', width: '2em',
						backgroundColor: RGBToString(getDefaultColor(col)) }}></div>
					{col}
				</div>)}
			</div>

		</div>
		<div style={{ overflow: 'auto' }}>
			<Sketch color={rgbaToHsva(getDefaultColor(picking))}/>
		</div>
	</div> ;
}