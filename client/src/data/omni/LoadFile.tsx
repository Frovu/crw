import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { apiPost, prettyDate, useEventListener } from '../../util';
import UplotReact from 'uplot-react';
import { axisDefaults, color, seriesDefaults } from '../../plots/plotUtil';

const fileFormats = ['w0'] as const;
const omniVariables = ['sw_speed', 'sw_temperature', 'sw_density', 'imf_scalar', 'imf_x', 'imf_y', 'imf_z', 'dst_index', 'kp_index', 'ap_index'] as const;

function parseW0(text: string) {
	const allLines = text.split('\n');
	const numbersIdx = allLines.findIndex(line => /^[\d\-\s.]+$/.test(line));
	const times = [], values = [];
	for (const line of allLines.slice(numbersIdx)) {
		if (!line) continue;
		const split = line.trim().split(/\s+/);
		values.push(...split.slice(0, 12).map(v =>
			/9999/.test(v) ? null : parseFloat(v)));
		if (split.length > 12) {
			const [ day, mon, year ] = split.slice(-3).map(a => parseInt(a));
			const tstmp = Date.UTC(year, mon-1, day) / 1e3;
			times.push(...Array.from(Array(24).keys()).map(i => tstmp + i * 3600));
		}
	}
	return [times, values.slice(0, times.length)];
}

export default function LoadFile({ path }: { path: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [fileText, setFileText] = useState<string>();
	const [fileFormat, setFileFormat] = useState(fileFormats[0]);
	const [targetVar, setTargetVar] = useState<typeof omniVariables[number]>(omniVariables[0]);
	const [report, setReport] = useState('');

	const data = useMemo(() => {
		if (!fileText) return null;
		const [times, values] = parseW0(fileText);
		return [times, values];
	}, [fileText]);

	const mutation = useMutation(async () => {
		if (!data || !data[0].length) return;
		const transposed = data[0].map((time, i) => [time, data[1][i]]);
		await apiPost(path, {
			variable: targetVar,
			rows: transposed
		});
	}, {
		onError: (e: Error) => setReport(e.toString()),
		onSuccess: () => {
			queryClient.invalidateQueries('omni');
			setReport('');
			setOpen(false);
		}
	});

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (open) e.stopImmediatePropagation();
		if (e.code === 'Escape')
			setOpen(false);
	});

	return (<>
		<button style={{ padding: '2px 16px' }} onClick={() => setOpen(true)}>Load a file</button>
		{open && <>
			<div className='popupBackground'></div>
			<div className='popup' style={{ transform: 'unset', left: 8, top: 8, padding: '0 2em' }}>
				<h4>Load data from a file</h4>
				<div>
					Variable: <select style={{ width: '11.5ch', marginRight: '24px' }}
						value={targetVar} onChange={e => setTargetVar(e.target.value as any)}>
						{omniVariables.map(vr => <option key={vr} value={vr}>{vr}</option>)}
					</select>
					Format: <select value={fileFormat} onChange={e => setFileFormat(e.target.value as any)}>
						<option value={fileFormats[0]}>{fileFormats[0]}</option>
					</select>
					<br/><label>File: <input type='file' onChange={async (e) => setFileText(await e.target.files?.[0]?.text())}/></label>
					<br/>
				</div>
				{data && <div style={{ color: color('text-dark') }}>
					parsed [{data[0].length}] hours from {prettyDate(data[0][0]!)} to {prettyDate(data[0][data[0].length-1]!)}
				</div>}
				{data && data[0].length > 0 && <div>
					<UplotReact {...{
						data: data as any,
						options: {
							height: 260,
							width: 640,
							cursor: {
								drag: { dist: 10 },
								points: {
									size: 6,
									fill: color('acid'),
									stroke: color('acid')
								}
							},
							axes:[ {
								...axisDefaults(true),
							}, {
								...axisDefaults(true),
								values: (u, values) => values.map(v => v.toString())
							} ],
							series: [ {
								value: '{YYYY}-{MM}-{DD} {HH}:{mm}', stroke: color('text')
							}, {
								...seriesDefaults(targetVar, 'cyan', 'y'),
								value: (u, val) => val?.toString() ?? '  --  '
							}
							]
						}
					}}/>
				</div>}
				{data && data[0].length > 0 && <button style={{ marginTop: 16, padding: '2px 16px' }}
					onClick={() => mutation.mutate()}>Upload {targetVar} to server (overwrite)</button> }
				<div style={{ color: color('red'), height: '1em', marginBottom: 16 }}>{report}</div>
				<span onClick={() => setOpen(false)}
					style={{ position: 'absolute', top: 4, right: 5 }} className='closeButton'>&times;</span>
			</div>
		</>}
	</>);
}