import { useContext, useState } from 'react';
import { apiGet, apiPost, prettyDate } from '../../util';
import { NeutronContext } from './Neutron';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavigationContext } from '../../plots/NavigatedPlot';

export function FetchMenu() {
	const queryClient = useQueryClient();
	const { stations, data: neutronData } = useContext(NeutronContext)!;
	const {
		state: { selection, view, chosen },
	} = useContext(NavigationContext);
	const { min, max } = selection ?? view;
	const timeFrom = neutronData[0][min],
		timeTo = neutronData[0][max];

	const [report, setReport] = useState('');

	const mutation = useMutation({
		mutationFn: async (stationQuery: string[]) => {
			const body = (await apiGet('neutron/refetch', {
				from: timeFrom.toFixed(0),
				to: timeTo.toFixed(0),
				stations: stationQuery.join(),
			})) as { duration: number; changeCounts: { [station: string]: number } };
			console.log('refetch => ', body);
			return body;
		},
		onError: (e: any) => setReport(e.toString()),
		onSuccess: (data) => {
			queryClient.invalidateQueries();
			setReport(
				`Done in ${data.duration.toFixed(1)} seconds\n` +
					Object.entries(data.changeCounts)
						.map(([st, n]) => `${st.toUpperCase()}: ${n}`)
						.join('\n'),
			);
		},
	});

	return (
		<div>
			<h4 style={{ margin: '1em 0 1.5em 0' }}>Re-obtain and re-compute data?</h4>
			<p style={{ margin: '1em 3em 0 3em', textAlign: 'right', lineHeight: '1.5em' }}>
				<b>{Math.ceil((timeTo - timeFrom) / 3600) + 1}</b> hours
				<br />
				from {prettyDate(timeFrom)}
				<br />
				to {prettyDate(timeTo)}
				<br />
			</p>
			<pre style={{ color: mutation.isError ? 'var(--color-red)' : mutation.isPending ? 'var(--color-text)' : 'var(--color-green)' }}>
				{mutation.isPending ? 'loading..' : report}
			</pre>
			<button
				style={{ padding: '2px 16px' }}
				disabled={mutation.isPending || !chosen}
				autoFocus={!!chosen}
				onClick={() => mutation.mutate([chosen!.label])}
			>
				Fetch {chosen?.label ?? '???'}
			</button>
			<button style={{ padding: '2px 16px', marginLeft: 24 }} disabled={mutation.isPending} onClick={() => mutation.mutate(stations)}>
				Fetch all
			</button>
		</div>
	);
}

export function CommitMenu() {
	const queryClient = useQueryClient();

	const { data, corrections: allCorrs, setCorrections, openPopup } = useContext(NeutronContext)!;

	const [comment, setComment] = useState('');
	const [report, setReport] = useState('');

	const corrections = Object.fromEntries(
		Object.entries(allCorrs).map(([sta, values]) => [
			sta,
			values.map((v, i) => (v == null ? null : [data[0][i], v])).filter((ch): ch is number[] => ch != null),
		]),
	);

	const mutation = useMutation({
		mutationFn: () =>
			apiPost('neutron/revision', {
				comment: comment || null,
				revisions: corrections,
			}),
		onError: (e: any) => setReport(e.toString()),
		onSuccess: () => {
			queryClient.invalidateQueries();
			openPopup((p) => (p !== 'commit' ? p : null));
			setCorrections({});
		},
	});

	return (
		<div>
			<h4 style={{ margin: '1em 0 1.5em 0' }}>Commit revisions?</h4>
			<div style={{ margin: '1em 3em 0 3em', textAlign: 'right', lineHeight: '1.25em' }}>
				{Object.entries(corrections).map(([sta, corrs]) => (
					<p key={sta} style={{ margin: '1em 0 0 0' }}>
						<span style={{ color: 'var(--color-magenta)' }}>[{sta.toUpperCase()}]</span> <b>{corrs.length} </b>
						change{corrs.length === 1 ? '' : 's'} between&nbsp;
						{prettyDate(corrs[0][0])}
						<br /> and {prettyDate(corrs[corrs.length - 1][0])}{' '}
					</p>
				))}
			</div>
			<pre
				style={{
					margin: 4,
					height: '1.25em',
					color: mutation.isError ? 'var(--color-red)' : mutation.isPending ? 'var(--color-text)' : 'var(--color-green)',
				}}
			>
				{mutation.isPending ? 'loading..' : report}
			</pre>
			<div>
				<input
					type="text"
					placeholder="Comment"
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					style={{ padding: 4, margin: 8, width: 360, borderColor: 'var(--color-border)' }}
				></input>
			</div>
			<button style={{ padding: '2px 24px' }} autoFocus disabled={mutation.isPending} onClick={() => mutation.mutate()}>
				COMMIT
			</button>
			<button style={{ padding: '2px 24px', marginLeft: 24 }} onClick={() => openPopup(null)}>
				CANCEL
			</button>
		</div>
	);
}

export function Help() {
	return (
		<div style={{ width: '64vw' }}>
			<h4>How it (should) work</h4>
			<p style={{ textAlign: 'left', margin: '0 2em' }}>
				Use arrow keys to move cursor. Press ctrl/alt to get more speed.
				<br />
				Use shift to select regions with keyborad.
				<br />
				Use ctrl + up/down keys to change prime station.
				<br />
				Use double-click to select prime station from plot.
				<br />
				Drag cursor with shift/ctrl to zoom.
				<br />
				Press enter to make focused station prime.
				<br />
				Revisions log regarding point of fixed cursor is listed below minute plot.
				<br />
				Enable "Div" mode to input efficiency as a rational number (much better when n/18 counters are broke)
				<br />
				On a minute plot drag cursor with shift pressed to apply mask. Green line means current value of this hour, orange - automatically computed,
				yellow - computed with the mask. Press <b>I</b> for this to take effect.
				<br />
			</p>
			<h4 style={{ textAlign: 'left' }}>Keys to know</h4>
			<p style={{ textAlign: 'left', margin: '0 2em' }}>
				<b>H</b> - View this sacred message
				<br />
				<b>F</b> - Refetch data from source
				<br />
				<b>Z</b> - Zoom plot into selection
				<br />
				<b>R</b> - Discard not commited corrections
				<br />
				<b>C</b> - Commit corrections
				<br />
				<b>A</b> - Automatically determine efficieny from selection
				<br />
				<b>I</b> - Integrate current hour with a mask applied
				<br />
				<b>E</b> - Correct for efficiency
				<br />
				<b>Del</b> - Correct by removing points
				<br />
				<b>Esc</b> - To break free
				<br />
			</p>
		</div>
	);
}
