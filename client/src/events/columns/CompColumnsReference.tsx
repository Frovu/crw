import { useState } from 'react';
import { Button } from '../../components/Button';
import { useFeidInfo } from '../core/query';
import { cn } from '../../util';

const tabs = ['General', 'Functions', 'Data series'] as const;

export default function CompColumnsReference({ initialTab }: { initialTab?: (typeof tabs)[number] }) {
	const { series, functions, helpers } = useFeidInfo();
	const [activeTab, setTab] = useState<(typeof tabs)[number]>(initialTab ?? 'General');

	return (
		<div className="p-2 flex flex-col gap-4 select-text w-full">
			<div className="flex text-lg">
				{tabs.map((tab, i) => (
					<div key={tab}>
						{i > 0 && <span>|</span>}
						<Button className={cn('px-4', tab === activeTab ? 'underline' : '')} onClick={() => setTab(tab)}>
							{tab}
						</Button>
					</div>
				))}
			</div>
			{activeTab === 'Functions' && (
				<div className="text-justify flex flex-col gap-2 px-2 overflow-y-scroll">
					{Object.entries(functions).map(([name, func]) => (
						<div key={name}>
							<div>
								<span className="text-active">{name}</span>(
								{func.args.map((arg, i) => (
									<span
										title={`Can be: ${arg.types.join(' or ')}\nOf type: ${arg.dtypes.join(' or ')}`}
										className={cn('hover:text-active/90 cursor-default', arg.default && 'text-dark')}
									>
										{i > 0 && ', '}
										<u>{arg.name}</u>
										{arg.default && `=${arg.default}`}
									</span>
								))}
								)
							</div>
							<div className="pl-4">{func.desc}</div>
						</div>
					))}
					<div className="pt-2">
						Note that functions related to series come in groups of three. In the function ending with{' '}
						<b className="text-active">v</b> variations are normalized to the maximum value within the interval: b =
						(a - max) / (1 + max / 100). And in the function ending with <b className="text-active">vt</b>{' '}
						variations are both normalized and corrected for to the linear trend (found within the same interval) if
						the trend is positive.
					</div>
				</div>
			)}
			{activeTab === 'Data series' && (
				<div className="text-justify w-full flex flex-col gap-2 px-2 overflow-y-scroll">
					<div>
						Both the left and the right names are valid for series selection. Remember that $asd is equivalent to
						ser("asd")
					</div>
					{series.map((ser) => (
						<div key={ser.name}>
							<div>
								<span className="text-green" title={ser.db_name}>
									${ser.name}
								</span>
								<span> = {ser.display_name}</span>
							</div>
						</div>
					))}
				</div>
			)}
			{activeTab === 'General' && (
				<div className="text-justify w-full px-2 overflow-y-scroll">
					FEID provides a powerful framework for event paramteres calculation, called "computed columns". Such columns
					are evalutaed according to the <b>definition</b> given in form of a special expression. The language of
					these expressions closely resembles standard mathematical notation.
					<br />
					<br />
					Following operations are directly supporeted in the language: <b className="text-active">+, -, *, /</b>.
					Parentheses <b className="text-active">( )</b> can be used to manage operations order. Other operations are
					performed through <b>function calls</b>, in a form of{' '}
					<span className="text-active">function_name(arg_1, arg_2...)</span>, where each argument can be any
					expression, yielding suitable result. Full list of functions with their descriptions can be found in{' '}
					<Button className="underline" onClick={() => setTab('Functions')}>
						Functions
					</Button>{' '}
					tab of this manual. String literals, like column names for col() function use double quotes{' '}
					<b className="text-active">" "</b>.
					<br />
					<br />
					There are just two more special parts to this language. One is series designators, which take a form of{' '}
					<b className="text-active">$series_name</b>. These are just a convenient alias to a function call:{' '}
					<b>ser("series_name")</b>. Full list of available series names can be found in{' '}
					<Button className="underline" onClick={() => setTab('Data series')}>
						Series
					</Button>{' '}
					tab. And the second thing is "helpers", that are also just specific predetermined aliases. This is a
					complete list of them:
					<div className="flex flex-col gap-1 pt-2 pl-4">
						{Object.entries(helpers).map(([name, [desc, expr]]) => (
							<div>
								<b className="text-green">@{name}</b>: {desc} = <span className="text-dark">{expr}</span>
							</div>
						))}
					</div>
					<br />
					To get a more in-depth understanding of the evaluation process remember the following. Each expression can
					evaluate to three fundamental types: <b>COLUMN, SERIES, LITREAL</b>. <b>COLUMN</b> represents and array with
					a value for each FEID event. <b>LITREAL</b> represents a single value. And <b>SERIES</b> represents a
					hourly-averaged time-data series of some physical measurement. Logically, mathematical operations are
					forbidden between <b>COLUMN and SERIES</b>. For each of these three types, following data types are
					supported: <b>REAL, INT, TIME, TEXT</b>. These types are determined based on the operation and operands, for
					example <i>INT * INT = INT</i> but <i>INT / INT = REAL</i>. When <b>TIME</b> and <b>REAL, INT</b> are in the
					same operation, all numbers are regarded as an <u>amount of hours</u>, so <i>@start + 24</i> returns event
					start + one day, and also <i>TIME - TIME = INT</i>. ENUM values are converted to TEXT. In the end, each
					expression must evaluate to <b>COLUMN or LITERAL</b> to be a valid result.
					<br />
				</div>
			)}
		</div>
	);
}
