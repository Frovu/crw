import { openWindow } from '../../layout';
import { valueToString } from '../core/util';
import { timeInMargin } from '../../util';
import { EruptiveEntityMenu, EruptiveEntityTable } from './EruptiveEntityCore';
import type { MouseEvent } from 'react';

function CMEMenu() {
	const openEnlil = (e: MouseEvent) => {
		const params = { type: 'Sun View', mode: 'WSA-ENLIL' } as any;
		openWindow({ x: e.clientX - 200, y: e.clientY - 200, w: 800, h: 400, params, unique: 'enlil-view' });
	};

	return (
		<>
			<EruptiveEntityMenu entity="cme" />
			<button className="TextButton" onClick={openEnlil}>
				Open ENLIL view
			</button>
			<div className="separator" />
			<a className="Row" href="https://cdaw.gsfc.nasa.gov/CME_list/" target="_blank" rel="noreferrer">
				LASCO Catalogue
			</a>
		</>
	);
}

function FLRMenu() {
	return <EruptiveEntityMenu entity="flare" />;
}

function ICMEMenu() {
	return (
		<>
			<EruptiveEntityMenu entity="icme" />
			<div className="separator" />
			<a
				className="Row"
				href="https://izw1.caltech.edu/ACE/ASC/DATA/level3/icmetable2.htm"
				target="_blank"
				rel="noreferrer"
			>
				R&C Catalogue
			</a>
		</>
	);
}

function CMEPanel() {
	return (
		<EruptiveEntityTable
			entity="cme"
			rowColorCallback={({ event: cme, erupt, feid }) => {
				const linkedEvents = cme.linked_events?.split(',');
				const linked = linkedEvents?.find(
					(lnk) =>
						(lnk.includes('GST') || lnk.includes('IPS')) &&
						timeInMargin(feid.time, new Date(lnk.slice(0, 19) + 'Z'), 8 * 36e5)
				);

				if (linked) return 'text-orange';

				const cmeTime = erupt?.cme_time ?? feid.cme_time;
				const nearCme = cmeTime && timeInMargin(cme.time, cmeTime, 6e5);

				return nearCme ? 'text-orange' : null;
			}}
			cellContent={valueToString}
		/>
	);
}

function FLRPanel() {
	return (
		<EruptiveEntityTable
			entity="flare"
			rowColorCallback={({ event: flare, erupt, feid }) => {
				const flrTime = erupt?.flr_start ?? feid.flr_time;
				const cmeTime = erupt?.cme_time ?? feid.cme_time;

				if (flrTime && timeInMargin(flare.start_time, flrTime, 6e5)) return 'text-orange';

				const linkedEvents = flare.linked_events?.split(',');
				const linkedToCme =
					cmeTime &&
					linkedEvents?.find(
						(lnk) => lnk.includes('CME') && timeInMargin(cmeTime, new Date(lnk.slice(0, 19) + 'Z'), 6e5)
					);

				return linkedToCme ? 'text-orange' : null;
			}}
			cellContent={(val, column) => {
				const str = valueToString(val);
				return ['peak', 'end'].includes(column.name) ? str.split(' ')[1] : str;
			}}
		/>
	);
}

function ICMEPanel() {
	return (
		<EruptiveEntityTable
			entity="icme"
			rowColorCallback={({ event: icme, erupt, feid }) => {
				const startClose = timeInMargin(icme.time, feid.time, 4 * 36e5);
				const mcClose = feid.mc_time && timeInMargin(icme.body_start, feid.mc_time, 4 * 36e5);

				return startClose || mcClose ? 'text-orange' : null;
			}}
			cellContent={valueToString}
		/>
	);
}

export const FlaresTable = {
	name: 'Flares Table',
	Panel: FLRPanel,
	Menu: FLRMenu,
};

export const CMETable = {
	name: 'CME Table',
	Panel: CMEPanel,
	Menu: CMEMenu,
};

export const ICMETable = {
	name: 'ICME Table',
	Panel: ICMEPanel,
	Menu: ICMEMenu,
};
