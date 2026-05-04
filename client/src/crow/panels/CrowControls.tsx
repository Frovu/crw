import type { ReactNode } from 'react';
import { cn, prettyDate, useEventListener } from '../../util';
import {
	cycleCrowWindow,
	maxCrowYear,
	MIN_CROW_YEAR,
	setCrow10days,
	setCrowMonth,
	setCrowYear,
	useCrowSettings,
	useCrowWindowDebounced,
} from '../core/crowSettings';
import { Button } from '../../components/Button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { NumberInput } from '../../components/Input';

function YearButton({ diff, icon }: { diff: number; icon: ReactNode }) {
	const { windowStart } = useCrowSettings();
	const curYear = new Date(windowStart * 1e3).getUTCFullYear();

	return (
		<Button
			title={diff.toString()}
			className="grow shrink flex justify-center min-w-0"
			onClick={() => setCrowYear(curYear + diff)}
		>
			{icon}
		</Button>
	);
}

function Menu() {
	return <></>;
}

function Panel() {
	const { windowMode, windowStart } = useCrowSettings();
	const { start, end } = useCrowWindowDebounced();

	const date = new Date(windowStart * 1e3);
	const curYear = date.getUTCFullYear();
	const curMonth = windowMode !== 'year' ? date.getUTCMonth() : null;
	const curDay = windowMode === '10 days' ? date.getUTCDate() : null;

	useEventListener('action+plotPrevCrow', () => cycleCrowWindow(-1));
	useEventListener('action+plotNextCrow', () => cycleCrowWindow(1));
	useEventListener('action+zoom', () => {
		if (windowMode === 'year') return setCrowMonth(0);
		if (windowMode === 'month') return setCrow10days(1);
		if (windowMode === '10 days') return setCrowMonth(curMonth ?? 0);
	});

	return (
		<div>
			<div className="max-w-[218px] p-[2px]">
				<div className="p-[1px] pb-1 flex w-full items-center" onDoubleClick={() => setCrowYear(curYear, true)}>
					<YearButton diff={-10} icon={<ChevronsLeft />} />
					<YearButton diff={-1} icon={<ChevronLeft />} />
					<NumberInput
						className="w-16 ml-[1px] bg-bg font-bold"
						value={curYear}
						min={MIN_CROW_YEAR}
						max={maxCrowYear()}
						onChange={setCrowYear}
						onWheel={(e) => setCrowYear(curYear - Math.sign(e.deltaY))}
						allowNull={false}
					/>
					<YearButton diff={1} icon={<ChevronRight />} />
					<YearButton diff={10} icon={<ChevronsRight />} />
				</div>
				<div className="flex flex-wrap gap-[2px]">
					{[...Array(12).keys()].map((month) => (
						<Button
							key={month}
							variant="default"
							className={cn('w-13 text-sm', month === curMonth && 'font-bold border-cyan')}
							onMouseDown={() => setCrowMonth(month)}
						>
							{new Date(Date.UTC(curYear, month)).toLocaleString('en-us', { month: 'short' })}
						</Button>
					))}
				</div>
				<div className="flex w-full pt-[2px] gap-[2px]">
					{[1, 11, 21].map((day) => (
						<Button
							disabled={curMonth == null}
							key={day}
							variant="default"
							className={cn(
								'grow shrink min-w-4 text-sm whitespace-nowrap overflow-clip',
								day === curDay && 'font-bold border-cyan',
							)}
							onMouseDown={() => setCrow10days(day)}
						>
							{day}-{day > 20 ? 1 : day + 10}
						</Button>
					))}
				</div>

				<div className="flex w-full gap-2 pt-2 text-sm">
					<Button
						className="grow min-w-0 flex whitespace-nowrap pl-0 justify-between items-center"
						variant="default"
						onClick={() => cycleCrowWindow(-1)}
					>
						<ChevronLeft /> Prev (Q)
					</Button>
					<Button
						className="grow min-w-0 flex whitespace-nowrap pr-0 justify-between items-center"
						variant="default"
						onClick={() => cycleCrowWindow(1)}
					>
						Next (E) <ChevronRight />
					</Button>
				</div>
			</div>
			<div className="text-dark text-xs text-right w-fit p-1 leading-4">
				{prettyDate(start)}
				<br />
				{prettyDate(end)}
			</div>
		</div>
	);
}

export const CrowControls = {
	name: 'Crow Controls',
	Menu,
	Panel,
};
