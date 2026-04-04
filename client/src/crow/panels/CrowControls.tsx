import type { ReactNode } from 'react';
import { clamp, cn, prettyDate } from '../../util';
import { useCrowSettings, useCrowWindow } from '../core/crowSettings';
import { Button } from '../../components/Button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { NumberInput } from '../../components/Input';

const MIN_YEAR = 1957;
const maxYear = () => new Date().getUTCFullYear();

function Menu() {
	return <></>;
}

function Panel() {
	const { windowMode, windowStart } = useCrowSettings();
	const { start, end } = useCrowWindow();

	const date = new Date(windowStart * 1e3);
	const curYear = date.getUTCFullYear();
	const curMonth = windowMode !== 'year' ? date.getUTCMonth() : null;
	const curDay = windowMode === '10 days' ? date.getUTCDate() : null;

	const YearButton = ({ diff, icon }: { diff: number; icon: ReactNode }) => (
		<Button
			title={diff.toString()}
			className="grow shrink flex justify-center min-w-0"
			onClick={() => setYear(clamp(MIN_YEAR, maxYear(), curYear + diff))}
		>
			{icon}
		</Button>
	);

	const setYear = (val: number) =>
		useCrowSettings.setState((state) => {
			state.windowMode = 'year';
			state.windowStart = Date.UTC(val, 0, 1) / 1e3;
		});
	const setMonth = (val: number) =>
		useCrowSettings.setState((state) => {
			state.windowMode = 'month';
			state.windowStart = Date.UTC(curYear, val, 1) / 1e3;
		});
	const set10days = (val: number) =>
		useCrowSettings.setState((state) => {
			state.windowMode = '10 days';
			state.windowStart = Date.UTC(curYear, curMonth ?? 0, val) / 1e3;
		});

	return (
		<div>
			<div className="max-w-[220px] p-[2px]">
				<div className="p-[1px] pb-1 flex w-full items-center">
					<YearButton diff={-10} icon={<ChevronsLeft />} />
					<YearButton diff={-1} icon={<ChevronLeft />} />
					<NumberInput
						className="w-16 ml-[1px] bg-bg font-bold"
						value={curYear}
						min={MIN_YEAR}
						max={maxYear() + 1}
						onChange={setYear}
						onWheel={(e) => setYear(clamp(MIN_YEAR, maxYear(), curYear - Math.sign(e.deltaY)))}
						allowNull={false}
					/>
					<YearButton diff={1} icon={<ChevronRight />} />
					<YearButton diff={10} icon={<ChevronsRight />} />
				</div>
				<div className="flex flex-wrap gap-[2px]">
					{Array(12)
						.keys()
						.map((month) => (
							<Button
								key={month}
								variant="default"
								className={cn('w-13 text-sm', month === curMonth && 'font-bold border-cyan')}
								onMouseDown={() => setMonth(month)}
							>
								{new Date(Date.UTC(curYear, month)).toLocaleString('en-us', { month: 'short' })}
							</Button>
						))}
				</div>
				<div className="flex w-full pt-[2px]">
					{[1, 11, 21].map((day) => (
						<Button
							disabled={curMonth == null}
							key={day}
							variant="default"
							className={cn('grow text-sm', day === curDay && 'font-bold border-cyan')}
							onMouseDown={() => set10days(day)}
						>
							{day}-{day > 20 ? 1 : day + 10}
						</Button>
					))}
				</div>
			</div>
			<div className="text-dark text-sm text-right w-fit p-1 leading-4">
				{prettyDate(start)}
				<br />
				to {prettyDate(end)}
			</div>
		</div>
	);
}

export const CrowControls = {
	name: 'Crow Controls',
	Menu,
	Panel,
};
