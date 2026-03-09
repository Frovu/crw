import { useState } from 'react';
import { Button } from '../../components/Button';
import { useFeidInfo } from '../core/query';
import { cn } from '../../util';

const tabs = ['General', 'Functions', 'Data series'] as const;

export default function CompColumnsReference({ initialTab }: { initialTab?: (typeof tabs)[number] }) {
	const { series, functions, helpers } = useFeidInfo();
	const [activeTab, setTab] = useState<(typeof tabs)[number]>(initialTab ?? 'Functions');

	return (
		<div className="p-2 flex flex-col gap-4 select-text">
			<div className="flex text-lg">
				{tabs.map((tab) => (
					<Button
						key={tab}
						className={cn('px-2', tab === activeTab ? 'underline' : 'text-dark')}
						onClick={() => setTab(tab)}
					>
						{tab}
					</Button>
				))}
			</div>
			<div className="text-left flex flex-col gap-2 pl-2 overflow-y-scroll">
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
						<div className="pl-4 text-sm">{func.desc}</div>
					</div>
				))}
			</div>
		</div>
	);
}
