import { NumberInput } from './Input';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function MonthInput({
	interval,
	callback,
	monthLimit,
}: {
	interval: [number, number];
	callback: (a: [number, number]) => void;
	monthLimit?: number;
}) {
	const date = new Date(interval[0] * 1e3);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const count = Math.ceil((interval[1] - interval[0]) / 86400 / 31);

	const commit = (y: number, m: number, c: number) =>
		callback([0, c].map((a) => Date.UTC(y, m + a) / 1e3) as [number, number]);

	const set = (action: 'month' | 'year' | 'count', value: number) => {
		if (action === 'month') {
			commit(year, value, count);
		} else if (action === 'year') {
			commit(value, month, count);
		} else if (action === 'count') {
			commit(year, month, value);
		}
	};

	return (
		<div style={{ display: 'inline-block' }}>
			<select
				onWheel={(e) => set('month', Math.max(0, Math.min(month + Math.sign(e.deltaY), 11)))}
				value={monthNames[month]}
				onChange={(e) => set('month', monthNames.indexOf(e.target.value))}
			>
				{monthNames.map((mon) => (
					<option key={mon} id={mon}>
						{mon}
					</option>
				))}
			</select>{' '}
			<NumberInput
				style={{ width: 56 }}
				min={1957}
				max={new Date().getFullYear()}
				value={year}
				onChange={(v) => v && !isNaN(v) && set('year', v)}
			/>
			<span style={{ padding: '0 4px' }}>+</span>
			<input
				style={{ width: 48, textAlign: 'center', marginRight: 4 }}
				type="number"
				min="1"
				max={monthLimit}
				value={count}
				onChange={(e) => !isNaN(e.target.valueAsNumber) && set('count', e.target.valueAsNumber)}
			/>
			month{count === 1 ? '' : 's'}
		</div>
	);
}
