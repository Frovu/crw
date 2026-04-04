import { useEffect, useRef } from 'react';
import { KEY_COMB } from './app';
import { cn, dispatchCustomEvent, useEventListener } from '../util';
import { create } from 'zustand';
import { Popup } from '../components/Popup';
import { Button, CloseButton } from '../components/Button';
import CompColumnsReference from '../events/columns/CompColumnsReference';

export const infoPages = ['manual', 'columns', 'advanced', 'shortcuts', 'credit'] as const;

type InfoState = {
	infoOpen: boolean;
	infoPage: (typeof infoPages)[number];
	scrollPos: number;
	setScrollPos: (pos: number) => void;
	openInfo: () => void;
	closeInfo: () => void;
	setInfoPage: (page: (typeof infoPages)[number]) => void;
};

const useInfoState = create<InfoState>()((set) => ({
	infoOpen: false,
	infoPage: 'manual',
	scrollPos: 0,
	openInfo: () => set((state) => ({ ...state, infoOpen: true })),
	closeInfo: () => set((state) => ({ ...state, infoOpen: false })),
	setScrollPos: (pos) => set((st) => ({ ...st, scrollPos: pos })),
	setInfoPage: (page) => set((state) => ({ ...state, infoPage: page })),
}));

export default function ManualView() {
	const scrollRef = useRef<HTMLDivElement>(null);

	const { infoPage, infoOpen, setInfoPage, openInfo, closeInfo, setScrollPos } = useInfoState();

	useEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = infoPage === 'manual' ? useInfoState.getState().scrollPos : 0;
	}, [infoPage]);

	useEventListener('action+toggleManual', () => (infoOpen ? closeInfo() : openInfo()));

	const PageLink = ({ page, text }: { page: typeof infoPage; text: string }) => (
		<Button onClick={() => setInfoPage(page)}>
			<u>{text}</u>
		</Button>
	);

	return !infoOpen ? null : (
		<Popup className="top-1 left-1 w-[1000px] flex flex-col max-h-[calc(100vh-16px)] text-justify " onClose={closeInfo}>
			<div className="flex flex-wrap text-lg p-1 pb-2">
				{infoPages
					.map((page) => (
						<Button
							key={page}
							className={cn('px-3', page === infoPage && 'text-active')}
							onClick={() => setInfoPage(page)}
						>
							{page.at(0)?.toUpperCase() + page.slice(1)}
						</Button>
					))
					.reduce((list, el, i) => list.concat(<span key={i}>|</span>, el), [] as any)
					.slice(1)}
			</div>
			<div
				ref={scrollRef}
				className="overflow-y-scroll h-full px-4 [&_h2]:font-bold [&_h2]:text-xl [&_h2]:my-4 [&_h3]:font-bold [&_h3]:text-lg [&_h3]:my-3 [&_p]:m-3"
				onScroll={(e) => {
					if (['manual'].includes(infoPage)) setScrollPos((e as any).target.scrollTop);
				}}
			>
				{infoPage === 'manual' && (
					<div>
						<h2>General usage</h2>
						<h3>Program interface</h3>
						<p>
							The program interface consists of a navigation bar on the bottom and the main area. The bottom bar
							includes login button, layout menu, color theme selector and logs display. And the main area hosts
							unlimited number of useful program panels. Each panel can be indefinitely split either vertically or
							horizontally, or joined back with its sibling ("relinquish" option in the context menu). The size of
							a panel is changed by dragging it's border.
						</p>
						<p>
							Three color themes are presented (dark, light and monochrome), which can be{' '}
							<Button onClick={() => dispatchCustomEvent('action+switchTheme')}>
								<u>switched</u>
							</Button>{' '}
							from the bottom bar or by pressing <b>{KEY_COMB.switchTheme}</b> key. Colors can also be adjusted
							individually using the <i>ColorSettings</i> panel. Recommended theme is dark, other two themes are
							mainly intended for plot exports.
						</p>
						<p>
							Interaction with the program is performed primarily through context menus, which appear after{' '}
							<b>clicking right mouse button </b>on any panel, or the nav bar. The <b>nav bar context menu</b>{' '}
							contains some importnant general options like changing user password or resetting program settings.
							On the top of each panel's context menu one should select what is displayed in this panel, be it
							some type of plot or other useful interface.
						</p>
						<p>Tip: Resetting settings can sometimes fix minor program issues.</p>
						<p>
							Tip: Panels can be swapped by dragging them while holding Ctrl key, panels settings are persisted
							while doing so.
						</p>
						<p>
							Major part of program intercations can be performed more swiftly with keyboard.{' '}
							<PageLink page="shortcuts" text="The shortcuts" /> are listed on a separate tab of this manual and
							the <PageLink page="advanced" text="advanced section" /> covers more niche behaviours.
						</p>
						<h3>Utilising layouts</h3>
						<p>
							Layouts allow the user to quickly change tasks, without repeating the setup process. Each layout
							persists its panels disposition along with each panels settings. By default there are four layouts -
							one for observing events parameters along with interplanetary medium plots, the other for
							statistical plots, the third for exporting the plots, and the last one for observing solar sources.
							Layouts can be swiftly cycled through with <b>{KEY_COMB.switchLayout}</b> key.
						</p>
						<h3>User accounts</h3>
						<p>
							Registration is not mandatory to use the program, but the registered users have more options,
							including computation of new parameter columns, creatig samples of events, etc. Registration does
							not require anything apart from the username and password, and is needed to remember your work and
							allow working from different computers. Note that if you ever decide to make public samples, your
							username will be visible to other users. To change username contact support.
						</p>
						<h2>Events catalogue</h2>
						<p>
							The <i>FEID Table</i> panel allowes one to interact with the table which lists Forbush effects and
							other associated events parameters. Panel consists of the sample menu at the top and the table
							itself. The left corner of table footer shows the count of entries in current effective sample.
						</p>
						<h3>Picking interesting paramters</h3>
						<p>
							When working with the table, it is recommended to enable only those columns that are of interest at
							the moment. This can be done with the columns menu, which can be opened from context menu, or by
							pressing <b>{KEY_COMB.openColumnsSelector}</b> key. Multiple columns can be enabled or disabled by
							holding Ctrl and dragging cursor over them or by clicking at an entity name. Drag column names
							without pressing Ctrl in order to change their order. This menu is also used for custom column
							creation, which will be discussed below.
						</p>
						<h3>Navigating the table</h3>
						<p>
							Table is best navigated by moving the <span className="border border-active">cursor</span> with
							keyboard arrows. <b>Ctrl + Home/End</b> allows to quickly get to the top or the bottom of the table.
							While cursor stands in a time column, <b>Ctrl + Up/Down</b> move it to the previous/next year or the
							next non-null value, it is often much faster than scrolling with mouse wheel or PgUp/PgDown.
						</p>
						<p>
							Tip: When cursor is not set, press <b>{KEY_COMB.plot}</b> to set it to the{' '}
							<span className="text-cyan">plotted row</span>.
						</p>
						<p>Click at the column header to order table by this column. Click again to change the direction.</p>
						<h3>Filtering events</h3>
						<p>
							The <Button variant="default">Add filter</Button> button at the top of the table panel can be used
							to select events based on a paricular parameter. The same can be done by pressing{' '}
							<b>{KEY_COMB.addFilter}</b> key. Each filter consists of a column, operator and value. Several
							filters can be added to create a complex sample, which can be saved for later usage and comarison
							with other samples. Samples can also be created by manually picking individual events, it is covered
							more extensively in the <PageLink page="advanced" text="advanced section" />.
						</p>
						<p>
							Tip: Press <b>F</b> after setting the <span className="border border-active">cursor</span> on a cell
							in order to add new filter based on this cell value and column.
						</p>
						<p>
							If you seek for some OR like behavior in filters, <u>regexp</u> filter operators might come in
							handy.{' '}
							<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet">
								Regular expressions
							</a>{' '}
							are a powerful search and filter tool. Some examples: <i>okay|high</i> to filter for src
							confindence; <i>^(4|7|9)$</i> to include deifferent src types; <i>CH.*_2[^\d]</i> to search for
							second streams of coronal holes.
						</p>
						<p>
							Note: do not use comparison operations on enum type columns (like ons type), use <u>regexp</u>{' '}
							instead.
						</p>
						<h3>Downloading the data</h3>
						<p>
							In order to download the table data as it is currently viewed (respecting sample and enabled
							columns) use the "Export table" option in the context menu accessible by pressing on the{' '}
							<b>top part of the table panel</b>. Four format options are presented, but it is recommended to use
							the json one. Data can also be accessed via API directly, if you are willing to use it please
							contact us.
						</p>
						<h2>Drawing beatiful plots</h2>
						<p>
							Plots in this program may be divided into two categories: statistical plots which are drawn based on
							values of some event parameter across a sample, and plots of interplanetary medium behavior that are
							drawn per event. All plots are quite customizable, event ones allow to change time interval
							(relative to the event), toggle the display of events onsets, magnetic clouds, toggle time axis,
							toggle specific series and more. Statistical plots provide even more settings, allowing one to
							compare several columns across several samples. All settings are done through the context menu by
							clicking right mouse button. It is recommended to use layouts system to switch between working with
							samples statistics and events plots.
						</p>
						<p>
							In order to display an event on plots, use table context menu or press <b>P</b> key while{' '}
							<span className="border border-active">cursor</span> is standing in the desired row. Use{' '}
							<b>&lt; &gt;</b> keys to jump to the pervious/next event in the current sample, or <b>[ ]</b> keys
							to move across all events.
						</p>
						<p>
							Most of the plots include the legend, which can be toggled in the context menu and can be dragged
							with mouse cursor to change its position on the plot. Note that when legend is off, axis labels
							become colored.
						</p>
						<h4>Saving plots</h4>
						<p>
							If you only need to quickly save one plot, use the "Open in a new tab" option in plot's context
							menu. It will provide much better resolution than using a screenshot. However the program provides a
							lot of special functionality for plot export, allowing one to create compound publication-ready
							drawings and ensure their size, appearance and resolution. Export layout is pre-made for that task.
						</p>
						<p>
							The <i>Export Controls</i> panel includes all the settings used for advanced plots customization.
							This includes setting the target picture size in centimeters or inches, the font family and size in
							points and target resolution (which is actually just an upscale multiplier, so ppi values may look
							odd). It allows to make labels font appear the same size as the paper text, when inserted with the
							specified width. Note that, if so desired, it is possible to achieve exact picture size and ppi by
							finetuning plots size in the interface.
						</p>
						<p>
							The <i>Export Controls</i> panel also allowes to manually set plots scales and change labels and
							legend text. To alter specific scale, first click it to enable the override, then enter the scale
							values (left two) and/or scale position relative to plots height (right two, range from 0 to 1). To
							change plots text one may add infinite number of find and replace entries below the scales setup
							section. This replaces apply consecutively (from top to bottom) to all modifiable texts on all
							pictures, entries can be dragged to change application order. Find and replace uses{' '}
							<a
								target="_blank"
								rel="noreferrer"
								href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet"
							>
								regular expressions
							</a>{' '}
							making it a very powerful tool. On top of that one can use {'<i> <b> <sup> <sub>'} tags in the
							replace to make itallic, bold, superscript or subscript text.
						</p>
						<br />
						<br />
						<br />
						<br />
						The detailed manual is not finished yet.
						<br />
						For now please email to <a href="mailto:izmiran.crdt@gmail.com">izmiran.crdt@gmail.com</a> with any
						questions.
					</div>
				)}
				{infoPage === 'columns' && (
					<div>
						<CompColumnsReference />
					</div>
				)}
				{infoPage === 'advanced' && (
					<div>
						<h2>Sample management</h2>
						<p>
							After a sample is created one can add more filters to it with <Button>Add filter</Button> button.
							Sample is stored on server in form of filters, the resulting list of events is computed in your
							browser. Thus, if events ids change sample will not break. But on the other hand if anything happens
							to columns that are involved in filters, the sample will not work as expected.
						</p>
						<p>
							In order to add/remove specific events to the sample one should check into <b>pick events mode</b>.
							When this mode is active, table will include special column that shows status of each event in
							respect to the sample: <b>f</b>: passes sample's filters;{' '}
							<span style={{ color: 'var(--color-cyan)' }}>+</span>: is whitelisted;
							<span style={{ color: 'var(--color-magenta)' }}> -</span>: is blacklisted. Event can't be
							whitelisted and blacklisted at the same time. This column can be used to sort the table (just like
							with other columns). Use this to get to those filtered events that you want to blacklist.
						</p>
						<p>
							To whitelist an event click on special columns cell of the desired row. Or press <b>+</b> (=) key
							while <span className="border border-active">cursor</span> stands in the desired row. To blacklist
							do the same but with <b>Ctrl + click</b> or <b>-</b> key.
						</p>
						<p>
							One can share the sample ownership with co-authors by clicking on authors list and entering new
							names (separated by comma). All authors are equal in rights and they can for example remove you from
							your own sample (even you can't), so be careful there. One can also make the sample <b>public</b> so
							that it will be visible to anyone (only visible, not modifiable).
							<b>
								Be aware that public sample will not work properly if it's filters involve computed columns that
								are not visible to everyone.
							</b>
						</p>
						<p>
							Tip: Do not forget to <Button variant="default">Save changes</Button>.
						</p>
						<h3>Making changes</h3>
						<p>
							Operators can change table values, including ones that are computed from data. To do that one must
							set <span className="border border-active">cursor</span> to desired column and press Enter/Insert
							(or click the cell with mouse). Cell will turn into input field. When finished inputing the new
							value one should press Enter/Insert again (or click outside) for the change to actually apply.
							Inputs are validated according to corresponding column's data type, and ones that do not pass
							validation are marked with red. If entered value is valid it will apply locally (i.e. correlation
							plot will be redrawn with new data). But for changes to actually persist across sessions one must
							commit them by pressing <b>{KEY_COMB.commitChanges}</b> or a button that appears when cursor hovers
							over the changes display under the table. A confirmation dialog will popup, listing all the changes
							that are being commited. One must ensure that list does not contain any unintended modifications, if
							it does, one can discard specific changes using <CloseButton /> button. After confirm button is
							pressed, changes will be saved to the server and whole table data will be reloaded.
						</p>
						<p>
							If all changes are wrong or were made locally as an experiment, one may discard all of them with the{' '}
							<b>{KEY_COMB.discardChanges}</b> button under below the FEID table.
						</p>
						<p>
							Note that changes made to computed columns are persisted across computations. Thus, one should only
							change them if it's really necessary. Manually modified are marked with an{' '}
							<span className="mark-modified" /> asterisk. In order to opt back to automatically computed value
							one should change cell value to special word: <span className="text-active">auto</span>
						</p>
						<h3>Persist text transforms</h3>
						<p>
							The program allows to save text transform presets (sets of search & replace entries) to be used
							later or by other users. Save and load buttons can be found on the top of replaces list. When
							overwriting existing preset publicity or name can't be changed. To change that just create a new
							preset. When loading a preset, "overwrite current" option can be unchecked to merge current entries
							whith a preset (this allowes to load two presets on top of each other). When merging, entries with
							the same search value are ommited. Don't forget to save your presets after making modifications!
						</p>
						<h3>Advanced layout oprerations</h3>
						<p>
							- When a panel is split it is split in 1 to 1 ratio.
							<br />
							- Right click on panels border to split it's parent.
							<br />- Ctrl+click panel border to make left/top panel square.
						</p>
					</div>
				)}
				{infoPage === 'shortcuts' && (
					<div style={{ lineHeight: '2em' }}>
						<b>C</b> - Select Columns
						<br />
						<b>F</b> - Add Filter
						<br />
						<b>H</b> - Show this window
						<br />
						<b>T</b> - Switch application color theme
						<br />
						<b>L</b> - Switch application layout
						<br />
						<b>P</b> - Plot event at cursor, or set cursor to currently ploted event
						<br />
						<b>1</b> - Set X column for correlation or histogram from cursor
						<br />
						<b>2</b> - Set Y column for correlation or histogram from cursor
						<br />
						<b>K</b> - Re-compute row (acutally 3 rows)
						<br />
						<b>[</b> - Plot previous event
						<br />
						<b>]</b> - Plot next event
						<br />
						<b>&lt;</b> - Plot previous event from current sample
						<br />
						<b>&gt;</b> - Plot next event from current sample
						<br />
						<b>Ctrl+S</b> - Commit table changes
						<br />
						<b>Ctrl+X</b> - Discard table changes
					</div>
				)}
				{infoPage === 'credit' && (
					<div>
						<div style={{ paddingBottom: 8 }}>(c) IZMIRAN:</div>
						Anatoly Belov - Original database author
						<br /> Semyon Belov&nbsp; - The new program author
						<br /> Maria Abunina - Database contributions
						<br /> Nataly Shlyk&nbsp; - Database contributions
						<p style={{ paddingTop: 8 }}>
							Please email with any questions/suggestions:{' '}
							<a href="mailto:izmiran.crdt@gmail.com">izmiran.crdt@gmail.com</a>
						</p>
						<h4>Plots Data sources</h4>
						OMNI Database of solar wind parameters: <a href="http://omniweb.gsfc.nasa.gov">omniweb.gsfc.nasa.gov</a>
						<br />
						Y.Yermolaev solar wind structures:{' '}
						<a href="http://iki.rssi.ru/omni/catalog">iki.rssi.ru/omni/catalog</a>
					</div>
				)}
			</div>
		</Popup>
	);
}
