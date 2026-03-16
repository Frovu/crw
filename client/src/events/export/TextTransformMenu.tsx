import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useContext, useState, useMemo, type MouseEvent } from 'react';
import { AuthContext, closeContextMenu, color, logError, logSuccess } from '../../app';
import { apiGet, apiPost, cn, prettyDate } from '../../util';
import { usePlotExportSate } from './exportablePlots';
import type { TextTransform, TextTransformsSetsList } from '../../api';
import { Checkbox } from '../../components/Checkbox';
import { Button, CloseButton } from '../../components/Button';
import { SimpleSelect } from '../../components/Select';
import { TextInput } from '../../components/Input';

export type TextTransformMenuDetail = {
	action: 'save' | 'load';
};

export function TextTransformContextMenu({ detail: { action } }: { detail: TextTransformMenuDetail }) {
	const { overrides, set } = usePlotExportSate();
	const current = overrides.textTransform;
	const { login } = useContext(AuthContext);
	const [selected, setSelected] = useState<number | null>(null);
	const [nameInput, setNameInput] = useState('');
	const [publicInput, setPublicInput] = useState(false);
	const [doReplace, setDoReplace] = useState(true);
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['textTransforms'],
		queryFn: () => apiGet<TextTransformsSetsList>('events/text_transforms'),
	});

	const presets = useMemo(() => {
		if (!query.data) return null;
		return query.data.list.sort((a, b) => (a.author === login ? -1 : 1) - (b.author === login ? -1 : 1));
	}, [query.data, login]);

	const sel = presets?.find((p) => p.id === selected);

	const upsertMut = useMutation({
		mutationFn: () =>
			apiPost('events/text_transforms/upsert', {
				name: sel?.name ?? nameInput,
				public: sel?.public ?? publicInput,
				transforms: current,
			}),
		onSuccess: () => {
			logSuccess('Text preset saved: ' + (sel?.name ?? nameInput));
			setTimeout(closeContextMenu, 300);
			queryClient.invalidateQueries({ queryKey: ['textTransforms'] });
		},
		onError: logError,
	});

	const removeMut = useMutation({
		mutationFn: (name: string) => apiPost('events/text_transforms/remove', { name }),
		onSuccess: (msg, name) => {
			logSuccess('Text preset deleted: ' + name);
			queryClient.invalidateQueries({ queryKey: ['textTransforms'] });
		},
		onError: logError,
	});

	if (query.error) return <div style={{ color: color('red') }}>error</div>;
	if (!presets) return <div style={{ color: color('dark') }}>loading...</div>;

	const upsert = (e: MouseEvent) => {
		e.stopPropagation();
		upsertMut.mutate();
	};

	const load = (transforms: TextTransform[]) => () => {
		const entries = transforms.map(({ search, replace }, i) => ({ search, replace, id: Date.now() + i, enabled: true }));
		const merged = doReplace
			? entries
			: current?.concat(entries.filter((nt) => !current.find((t) => t.search === nt.search)));

		set('textTransform', merged);
		closeContextMenu();
	};

	if (action === 'load')
		return (
			<>
				<div className="text-dark">load text transforms set:</div>
				<Checkbox
					title="Current transforms will be lost if checked!"
					label="overwrite current"
					checked={doReplace}
					onCheckedChange={setDoReplace}
				/>
				<div className="separator" />
				{presets.map(({ id, name, public: isPub, author, transforms, created, modified }) => (
					<div
						key={id}
						className="flex items-center max-w-40"
						title={`Author: ${author}\nCreated: ${prettyDate(new Date(created))}\nModified: ${prettyDate(
							new Date(modified),
						)}`}
					>
						<div className="truncate shrink-3 min-w-0 pr-1" onClick={load(transforms)}>
							{name}
						</div>
						{isPub && <div className="text-dark text-xs">(public)</div>}
						{author === login && <CloseButton title="Delete preset" onClick={() => removeMut.mutate(name)} />}
					</div>
				))}
			</>
		);

	const nameInvalid =
		selected == null && (nameInput === '' || presets.find((p) => p.author === login && p.name === nameInput));

	return (
		<>
			<div className="flex items-center">
				Save as:
				<SimpleSelect
					className="w-44 bg-input-bg"
					value={selected}
					options={[
						[null, '-- new preset --'],
						...presets.filter((s) => s.author === login).map((ts) => [ts.id, ts.name] as [number, string]),
					]}
					onChange={setSelected}
				/>
			</div>
			{selected == null && (
				<div className="flex gap-1">
					Name:
					<TextInput
						className="w-30 grow"
						autoFocus
						invalid={!!nameInvalid}
						value={nameInput}
						onChange={(e) => setNameInput(e.target.value)}
					/>
				</div>
			)}
			{selected == null && (
				<Checkbox
					className={cn(publicInput && 'text-magenta')}
					label="public preset"
					checked={publicInput}
					onCheckedChange={setPublicInput}
				/>
			)}
			<div className="separator" />
			<div className="flex gap-3">
				<div style={{ color: color(upsertMut.isError ? 'red' : 'green') }}>
					{upsertMut.isSuccess ? 'OK' : upsertMut.isError ? 'ERROR' : ''}
				</div>
				<div style={{ flex: 1 }} />
				<Button disabled={!!nameInvalid} onClick={upsert}>
					Save preset
				</Button>
			</div>
		</>
	);
}
