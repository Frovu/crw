import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, prettyDate } from '../../util';
import UplotReact from 'uplot-react';
import { axisDefaults, color, seriesDefaults } from '../../plots/common/plotUtil';
import { SimpleSelect } from '../../components/Select';
import { Button } from '../../components/Button';
import { omniVariables } from '../../api';
import { Input } from '../../components/Input';

const fileFormats = ['w0'] as const;

function parseW0(text: string) {
	const allLines = text.split('\n');
	const numbersIdx = allLines.findIndex((line) => /^[\d\-\s.]+$/.test(line));
	const times = [],
		values = [];
	for (const line of allLines.slice(numbersIdx)) {
		if (!line) continue;
		const split = line.trim().split(/\s+/);
		values.push(...split.slice(0, 12).map((v) => (/9999/.test(v) ? null : parseFloat(v))));
		if (split.length > 12) {
			const [day, mon, year] = split.slice(-3).map((a) => parseInt(a));
			const tstmp = Date.UTC(year, mon - 1, day) / 1e3;
			times.push(...Array.from(Array(24).keys()).map((i) => tstmp + i * 3600));
		}
	}
	return [times, values.slice(0, times.length)];
}

export default function LoadFile({ path }: { path: string }) {
	const queryClient = useQueryClient();
	const [fileText, setFileText] = useState<string>();
	const [fileFormat, setFileFormat] = useState(fileFormats[0]);
	const [targetVar, setTargetVar] = useState<string>('V');
	const [report, setReport] = useState('');

	const data = useMemo(() => {
		if (!fileText) return null;
		const [times, values] = parseW0(fileText);
		return [times, values];
	}, [fileText]);

	const mutation = useMutation({
		mutationFn: async () => {
			if (!data || !data[0].length) return;
			const transposed = data[0].map((time, i) => [time, data[1][i]]);
			await apiPost(path, {
				variable: targetVar,
				rows: transposed,
			});
		},
		onError: (e: Error) => setReport(e.toString()),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['omni'] });
			setReport('');
		},
	});

	return (
		<>
			<div className="flex items-center">
				Variable:
				<SimpleSelect className="w-20 mr-4" value={targetVar} options={omniVariables.map((s) => s.name)} onChange={setTargetVar} />
				Format:
				<SimpleSelect className="w-12" value={fileFormat} onChange={setFileFormat} options={fileFormats} />
			</div>
			<label>
				Load file: <Input type="file" onChange={async (e) => setFileText(await e.target.files?.[0]?.text())} />
			</label>
			{data && (
				<div className="text-dark text-xs">
					parsed [{data[0].length}] hours from {prettyDate(data[0][0]!)} to {prettyDate(data[0][data[0].length - 1]!)}
				</div>
			)}
			{data && data[0].length > 0 && (
				<div>
					<UplotReact
						{...{
							data: data as any,
							options: {
								padding: [8, 12, 8, 12],
								height: 200,
								width: 480,
								cursor: {
									drag: { dist: 10 },
									points: {
										size: 6,
										fill: color('acid'),
										stroke: color('acid'),
									},
								},
								axes: [
									{
										...axisDefaults(true),
										space: 42,
									},
									{
										...axisDefaults(true),
										values: (u, values) => values.map((v) => v.toString()),
									},
								],
								series: [
									{
										value: '{YYYY}-{MM}-{DD} {HH}:{mm}',
										stroke: color('text'),
									},
									{
										...seriesDefaults(targetVar, 'cyan', 'y'),
										value: (u, val) => val?.toString() ?? '  --  ',
									},
								],
							},
						}}
					/>
				</div>
			)}
			{data && data[0].length > 0 && <Button onClick={() => mutation.mutate()}>Upload {targetVar} to server (overwrite)</Button>}
			<div className="text-red">{report}</div>
		</>
	);
}
