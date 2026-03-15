import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useContext, useState, useMemo } from 'react';
import { AuthContext, closeContextMenu, color, logError, logSuccess } from '../../app';
import type { TextTransform } from '../../plots/basicPlot';
import { apiGet, apiPost, prettyDate } from '../../util';
import { usePlotExportSate } from './exportablePlots';

export type TextTransformMenuDetail = {
	action: 'save' | 'load';
};
export function TextTransformContextMenu({ detail: { action } }: { detail: TextTransformMenuDetail }) {
	const {
		overrides: { textTransform: current },
		set,
	} = usePlotExportSate();
	const { login } = useContext(AuthContext);
	const [selected, setSelected] = useState<number | null>(null);
	const [nameInput, setNameInput] = useState('');
	const [publicInput, setPublicInput] = useState(false);
	const [doReplace, setDoReplace] = useState(true);
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['textTransforms'],
		queryFn: () => apiGet<{ list: TransformSet[] }>('events/text_transforms'),
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
				transforms: current?.filter((f) => f.enabled).map(({ search, replace }) => ({ search, replace })),
			}),
		onSuccess: () => {
			logSuccess('Text preset saved: ' + (sel?.name ?? nameInput));
			setTimeout(closeContextMenu, 1000);
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

	const upsert = (e: any) => {
		e.stopPropagation();
		upsertMut.mutate();
	};

	const load = (transforms: TextTransform[]) => (e: any) => {
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
				<div style={{ color: color('dark'), textAlign: 'left', marginTop: -2 }}>load text transforms set:</div>
				<label title="Current transforms will be lost if checked" style={{ paddingLeft: 2 }}>
					overwrite current
					<input type="checkbox" checked={doReplace} onChange={(e) => setDoReplace(e.target.checked)} />
				</label>
				<div className="separator" />
				{presets.length < 1 && <div>no saved presets</div>}
				{presets.length > 0 && (
					<div style={{ userSelect: 'none' }}>
						{presets.map(({ id, name, public: isPub, author, transforms, created, modified }) => (
							<div
								key={id}
								className="SelectOption"
								style={{ display: 'flex', maxWidth: 320, alignItems: 'center', gap: 6, padding: '0 4px' }}
								title={`Author: ${author}\nCreated: ${prettyDate(new Date(created))}\nModified: ${prettyDate(
									new Date(modified),
								)}`}
							>
								<div
									style={{
										whiteSpace: 'nowrap',
										textOverflow: 'ellipsis',
										overflow: 'hidden',
										cursor: 'pointer',
										flex: 1,
									}}
									onClick={load(transforms)}
								>
									{name}
								</div>
								{isPub && <div style={{ color: color('dark'), fontSize: 12 }}>(public)</div>}
								{author === login ? (
									<div className="CloseButton" title="Delete preset" onClick={() => removeMut.mutate(name)} />
								) : (
									<div style={{ width: 16 }} />
								)}
							</div>
						))}
					</div>
				)}
			</>
		);
	const nameInvalid =
		selected == null && (nameInput === '' || presets.find((p) => p.author === login && p.name === nameInput));

	return (
		<div className="Group">
			<div style={{ color: color('dark'), textAlign: 'left', marginTop: -2, fontSize: 14 }}>
				Only enabled replaces are saved!
			</div>
			<div>
				Save as:
				<select
					className="Borderless"
					style={{ width: 194, marginLeft: 4 }}
					value={selected ?? '__new'}
					onChange={(e) => setSelected(e.target.value === '__new' ? null : parseInt(e.target.value))}
				>
					<option value="__new">-- new preset --</option>
					{presets
						.filter((s) => s.author === login)
						.map(({ id, name }) => (
							<option key={id} value={id}>
								{name}
							</option>
						))}
				</select>
			</div>
			{selected == null && (
				<div>
					Name:
					<input
						autoFocus
						type="text"
						style={{ width: 222, marginLeft: 4, borderColor: color(nameInvalid ? 'active' : 'bg') }}
						value={nameInput}
						onChange={(e) => setNameInput(e.target.value)}
						onKeyDown={(e) => e.code === 'Enter' && upsert(e)}
					/>
				</div>
			)}
			{selected == null && (
				<div>
					<label style={{ color: color(publicInput ? 'magenta' : 'text') }}>
						public preset
						<input type="checkbox" checked={publicInput} onChange={(e) => setPublicInput(e.target.checked)} />
					</label>
				</div>
			)}
			<div className="separator" />
			<div className="flex gap-3">
				<div style={{ color: color(upsertMut.isError ? 'red' : 'green') }}>
					{upsertMut.isSuccess ? 'OK' : upsertMut.isError ? 'ERROR' : ''}
				</div>
				<div style={{ flex: 1 }} />
				<button className="TextButton" disabled={!!nameInvalid} style={{ textAlign: 'right' }} onClick={upsert}>
					Save preset
				</button>
			</div>
		</div>
	);
}
