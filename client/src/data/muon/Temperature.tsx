import { useQuery } from 'react-query';
import { color, axisDefaults, seriesDefaults } from '../../plots/plotUtil';
import { apiGet, clamp, useMonthInput, useSize } from '../../util';
import { useEffect, useMemo, useState } from 'react';
import UplotReact from 'uplot-react';
import uPlot from 'uplot';

const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10];

function plotOptions(): Omit<uPlot.Options,'width'|'height'> {
	return {
		tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'UTC'),
		legend: { show: false },
		padding: [12, 12, 0, 8],
		cursor: {
			drag: { y: true, dist: 24 },
			points: { fill: color('text') }
		},
		scales: {
			t: {
				range: (u, min, max) => [min-1, max+1]
			}
		},
		axes: [
			{
				...axisDefaults(true),
			}, {
				...axisDefaults(true),
				scale: 't'
			}
		],
		series: [
			{ value: '{YYYY}-{MM}-{DD} {HH}:{mm} UTC', stroke: color('text') },
			{
				...seriesDefaults('t_m_avg', 'green', 't'),
				value: (u, val) => val?.toFixed(1) ?? '--',
				width: 2,
			},
			...LEVELS.map(lvl => ({
				...seriesDefaults(`t_${lvl}mb`, 'purple', 't'),
				value: (u, val) => val?.toFixed(1) ?? '--',
			}) as uPlot.Series)
		]

	};
}

export default function TemperatureApp() {
	const [interval, monthInput] = useMonthInput(new Date(Date.now() - 864e5 * 365));
	const [coords, setCoords] = useState({ lat: 55.47, lon: 37.32 });

	const query = useQuery({
		queryKey: ['temperature', interval, coords.lat, coords.lon],
		queryFn: () => apiGet<{ status: 'ok' | 'busy', downloading?: { [key: string]: number }, coords: { lat: number, lon: number },
			fields: string[], rows: null | number[][] }>('meteo/temperature', {
			from: interval[0],
			to: interval[1],
			...coords
		}),
		staleTime: 36e5,
		refetchInterval: (data) => data?.status === 'busy' ? 500 : false
	});

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [legendContainer, setLegendContainer] = useState<HTMLDivElement | null>(null);
	const [u, setUplot] = useState<uPlot | null>(null);
	const size = useSize(container);

	useEffect(() => u?.setSize(size), [u, size]);

	const plotComponent = useMemo(() => {
		if (!query.data) return null;
		const { status, rows, fields } = query.data;
		if (status !== 'ok' || rows == null) return null;

		const data = fields.map((f, i) => rows.map(row => row[i]));

		return <UplotReact {...{ options: { ...size, ...plotOptions(), legend: { mount: (upl, el) => legendContainer?.append(el) } },
			data: data as any, onCreate: setUplot }}/>;
	}, [query.data]); // eslint-disable-line

	const download = () => {
		if (!query.data) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([
			JSON.stringify({
				createdAt: new Date().toISOString(),
				info: 'Atmospheric temperature data of NCEP/NCAR Reanalysis project (https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html) interpolated for scpecific location and for 1 hour time resolution. Obtained at: '+document.location.toString(),
				latitude: query.data.coords.lat,
				longitude: query.data.coords.lon,
				fields: query.data.fields,
				rows: query.data.rows?.map(row => [new Date(row[0] * 1e3), ...row.slice(1)])
			}, null, 2)
		], { type: 'application/json' }));
		a.download = 'air_temperature.json';
		a.click();
	};

	return <>
		<div style={{ height: '100%', display: 'grid', gridTemplateColumns: '360px 1fr', gap: 4, userSelect: 'none' }}>
			<div>
				{monthInput}
				<div style={{ padding: '8px 0 0 8px', display: 'flex', gap: 16 }}>
					{['lat', 'lon'].map(coord => <label title={`geographical ${coord === 'lat' ? 'latitude (-90 to 90)' : 'longitude (-180 to 180)'}`}>
						{coord} = <input type='text' defaultValue={coords[coord as 'lat'|'lon']}
							style={{ width: 56, textAlign: 'center', borderColor: color('border') }}
							onKeyDown={e => e.target instanceof HTMLInputElement && ['Enter', 'NumpadEnter', 'Escape'].includes(e.code) && e.target.blur()}
							onBlur={e => setCoords(c => {
								const val = parseFloat(e.target.value);
								return isNaN(val) ? c : { ...c,
									[coord]: coord === 'lat' ?  clamp(-90, 90, val) : clamp(-180, 180, val) };
							})}/></label>)}
				</div>
				<div style={{ padding: '8px 0 4px 8px' }}>
					{query.data?.status !== 'ok' && <div>status: {query.data?.status ?? 'loading..'}</div>}
					<div style={{ color: color('red') }}>{query.error?.toString()}</div>
					{Object.entries(query.data?.downloading ?? {}).map(([year, progr]) => <div key={year}>
						downloading {year}: <span style={{ color: color('acid') }}>{(progr * 100).toFixed(0)} %</span>
					</div>)}
				</div>
				<div ref={el => setLegendContainer(el)} style={{ border: '2px var(--color-border) solid' }}/>
				<div style={{ padding: '8px 4px' }}>
					<details style={{ paddingBottom: 8, textAlign: 'justify' }}>
						<summary>Dataset info</summary>
						Atmospheric temperature on 18 barometric levels is obtained from <a href="https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html">NCEP/NCAR Reanalysis project</a> and interpolated for scpecific location and for 1 hour time resolution using B-splines.
					</details>
					{query.data?.status === 'ok' && <button style={{ padding: '2px 12px' }} onClick={download}>Download .json</button>}
					{query.data?.status === 'ok' && <div style={{ color: color('text-dark'), paddingTop: 4 }}>
						lat={query.data.coords.lat}, lon={query.data.coords.lon}
					</div>}
				</div>
			</div>
			<div ref={el => setContainer(el)} style={{ position: 'relative' }}>
				{query.isLoading && <div className='center'>LOADING...</div>}
				{query.data && query.data.rows == null && <div className='center'>NO DATA</div>}
				<div style={{ position: 'absolute' }}>
					{plotComponent}
				</div>
			</div>

		</div>
	</>;
}