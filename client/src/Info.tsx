/* eslint-disable @typescript-eslint/indent */
import { useEffect, useRef } from 'react';
import { KEY_COMB, color, infoPages, useAppSettings } from './app';
import './styles/Table.css';
import { dispatchCustomEvent, useEventListener } from './util';
import { create } from 'zustand';

type InfoState = {
	scrollPos: number,
	setScrollPos: (pos: number) => void
};

const useInfoState = create<InfoState>()((set) => ({
	scrollPos: 0,
	setScrollPos: pos => set(st => ({ ...st, scrollPos: pos }))
}));

export default function Help() {
	const { infoPage, closeInfo, setInfoPage } = useAppSettings();

	const scrollRef = useRef<HTMLDivElement>(null);

	const { setScrollPos } = useInfoState();

	useEffect(() => {
		if (scrollRef.current)
			scrollRef.current.scrollTop = infoPage === 'manual' ? useInfoState.getState().scrollPos : 0;
	}, [infoPage]);

	// useEffect(() => {
	// 	if (scrollRef.current) // FIXME
	// 		scrollRef.current.scrollTop = scrollRef.current.scrollHeight
	// }, [])

	useEventListener('escape', closeInfo);

	const PageLink = ({ page, text }: { page: typeof infoPage, text: string }) =>
		<button className='TextButton' onClick={() => setInfoPage(page)}><u>{text}</u></button>;

	return <>
		<div className='PopupBackground' onClick={() => closeInfo()}></div>
		<div className='Popup' style={{ padding: '2em 2em', top: 8, left: 8,
			display: 'flex', flexFlow: 'column',
			width: '80ch', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 32px)', textAlign: 'justify' }}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 18, padding: '0 0 1em calc(1em - 8px)' }}>
				{infoPages.map(page =>
					<button className='TextButton' style={{ color: page === infoPage ? color('active') : 'unset', padding: '0 8px' }}
						onClick={() => setInfoPage(page)}>
						{page.at(0)?.toUpperCase()+page.slice(1)}
					
					</button>).reduce((list, el) => list.concat(<span>|</span>, el), [] as any).slice(1)
				}
			</div><div ref={scrollRef} style={{ overflowY: 'auto', padding: '0 1em' }}
				onScroll={e => { if (['manual'].includes(infoPage)) setScrollPos((e as any).target.scrollTop); }}>
				{infoPage === 'manual' && <div>
	<h2>General usage</h2>
	<h3>Program interface</h3>
	<p>The program interface consists of a navigation bar on the bottom and the main area. The bottom bar includes login button, layout menu, color theme selector and log display. And the main area hosts unlimited number of useful program panels. Each panel can be indefinitely split either vertically or horizontally, or joined back with its sibling ("relinquish" option in the context menu).</p>
	<p>Three color themes are presented, which can be <button className='TextButton' onClick={() => dispatchCustomEvent('action+switchTheme')}><u>switched</u></button> from the bottom bar or by pressing <b>{KEY_COMB.switchTheme}</b> key. Colors can also be adjusted individually using the <i>ColorSettings</i> panel.</p>
	<p>Interaction with program is performed primarily through context menus, which appear after <b>clicking right mouse button </b>on any panel, or the nav bar. The nav bar context menu containing some general options like changing user password or resetting program settings. On the top of each panel's context menu one should select what is displayed in this panel, be it some type of plot or other useful interface.</p>
	<p>Tip: Resetting settings can sometimes fix minor program issues.</p>
	<p>Tip: Panels can be swapped by dragging them while holding Ctrl key, panels settings are persisted while doing so.</p>
	<p>Major part of program intercations can be performed more swiftly with keyboard. <PageLink page='shortcuts' text='The shortcuts'/> are listed on a separate tab of this manual and the <PageLink page='advanced' text='advanced section'/> covers more niche behaviours.</p>
	<h3>Utilising layouts</h3>
	<p>Layouts allow the user to quickly change tasks, without the need for repeating the setup. Each layout persists its panels disposition along with each panels settings. By default there are three layouts - one for observing events parameters along with interplanetary medium plots, the other for statistical plots, and the third for exporting the plots. Layouts can be swiftly cycled through with <b>{KEY_COMB.switchLayout}</b> key.</p>
	<h3>User accounts</h3>
	<p>Registration is not mandatory to use the program, but the registered users have more options, including computation of new parameter columns, creatig samples of events, etc. Registration does not require anything apart from the username and password, and is needed to remember your work and allow working from different computers. Note that if you ever decide to make public samples, your username will be visible to other users. To change username contact support.</p>
	<h2>Events catalogue</h2>
	<p>The <i>MainTable</i> panel allowes one to interact with the table which lists Forbush effects and other associated events parameters. Panel consists of the sample menu at the top and the table itself. The left corner of table footer shows the count  of entries in current effective sample.</p>
	<h3>Picking interesting paramters</h3>
	<p>When working with the table, it is recommended to enable only those columns that are of interest at the moment. This can be done with the columns menu, which can be opened from context menu, or by pressing <b>{KEY_COMB.openColumnsSelector}</b> key. Multiple columns can be enabled or disabled by holding Ctrl and dragging cursor over them or by clicking at an entity name. Drag column names without pressing Ctrl in order to change their order. This menu is also used for custom column creation, which will be discussed below.</p>
	<h3>Navigating table</h3>
	<p>Table is best navigated by moving the <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> with keyboard arrows. <b>Ctrl + Home/End</b> allows to quickly get to the top or the bottom of the table. While cursor stands in the time column, <b>Ctrl + Up/Down</b> move it to the previous/next year, it is often much faster than scrolling with mouse wheel or PgUp/PgDown.</p>
	<p>Tip: When cursor is not set, press <b>{KEY_COMB.plot}</b> to set it to the <span style={{ background: 'var(--color-area)' }}>plotted row</span>.</p>
	<p>Click at the column header to order table by this column. This always scrolls table to the end, which can be used to quickly observe minimum and maximum values in a column.</p>
	<h3>Filtering events</h3>
	<p>The <button>Add filter</button> button at the top of the table panel can be used to select events based on a paricular parameter. The same can be done by pressing <b>{KEY_COMB.addFilter}</b> key. Each filter consists of a column, operator and value. Several filters can be added to create a complex sample, which can be saved for later usage and comarison with other samples. Samples can also be created by manually picking individual events, it is covered more extensively in the <PageLink page='advanced' text='advanced section'/>.</p>
	<p>Tip: Press <b>F</b> after setting the <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> on a  cell in order to add new filter based on this cell value and column.</p>
	<h3>Downloading the data</h3>
	<p>In order to download the table data as it is currently viewed (respecting sample and enabled columns) use the "Export table" option in the context menu accessible by pressing on the top part of the table panel. 4 format options are presented, but it is recommended to use the json one. Data can also be accessed via API directly, if you are willing to use it please contact us.</p>
	<h2>Drawing beatiful plots</h2>
	<p>Plots in this program may be divided into two categories: statistical plots which are drawn based on values of some event parameter across a sample, and plots of interplanetary medium behavior that are drawn per event. All plots are quite customizable, event ones allow to change time interval (relative to the event), toggle the display of events onsets, magnetic clouds, toggle time axis, toggle specific series and more. Statistical plots provide even more settings, allowing one to compare several columns across several samples. All settings are done through the context menu by clicking right mouse button. It is recommended to use layouts system to switch between working with samples statistics and events plots.</p>
	<p>In order to display an event on plots, use table cell context menu or press <b>P</b> key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> is standing in corresponding row. Use <b>&lt; &gt;</b> keys to jump to the pervious/next event in the current sample, or <b>[ ]</b> keys to move across all events.</p>
	<p>Most of the plots include the legend, which can be toggled in the context menu and can be dragged with mouse cursor to change its position on the plot. Note that when legend is off, axis labels become colored.</p>
	<h4>Saving plots</h4>
	<p>If you only need to quickly save one plot, use the "Open in a new tab" option in plot's context menu. It will provide much better resolution than using a screenshot. However the program provides a lot of special functionality for plot export, allowing to create compound drawings and ensure their size, appearance and resolution. Export layout is pre-made for that task.</p>
	<p>The <i>ExportControls</i> panel includes all the settings used for advanced plots customization. This includes setting the target picture size in centimeters or inches, the font family and size in points and target resolution (which is actually just an upscale multiplier, so ppi values may look odd). It allows to make labels font appear the same size as the paper text, when inserted with the specified width. Note that if so desired, it is possible to achieve exact picture size and ppi by finetuning plots size in the interface.</p>
	<p>The <i>ExportControls</i> panel also allowes to manually set plots scales and change labels and legend text. To alter specific scale, first click it to enable the override, then enter the scale values (left two) and/or scale position relative to plots height (right two, range from 0 to 1). To change plots text one may add infinite number of find and replace entries below the scales setup section. This replaces apply consecutively (from top to bottom) to all modifiable texts on all pictures, entries can be dragged to change application order. Find and replace uses <a target="_blank" rel="noreferrer" href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet">regular expressions</a> making it a very powerful tool. On top of that one can use {'<i> <b> <sup> <sub>'} tags in the replace to make itallic, bold, superscript or subscript text.</p>


<br/><br/><br/><br/>
					The detailed manual is not finished yet.<br/>
					For now please email to <a href='mailto:izmiran.crdt@gmail.com'>izmiran.crdt@gmail.com</a> with any questions.	
				</div>}
				{infoPage === 'advanced' && <div>
					<h3>Persist text transforms</h3>
					<p>The program allows to save text transform presets (sets of search & replace entries) to be used later or by other users. Save and load buttons can be found on the top of replaces list. When overwriting existing preset publicity or name can't be changed. To change that just create a new preset. When loading a preset, "overwrite current" option can be unchecked to merge current entries whith a preset (this allowes to load two presets on top of each other). When merging, entries with the same search value are ommited. Don't forget to save your presets after making modifications!</p>
					<p>.</p>
					<p>.</p>
					<p>.</p>
					Work in progress
					{/* <p>
					If you seek for some OR like behavior, <u>regexp</u> filter operators might come in handy. <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet">Regular expressions</a> are a powerful search and filter tool, just look at some examples: <i>okay|high</i> to filter for SStype confindence; <i>^(4|7|9)$</i> to include deifferent SStypes; <i>CH.*_2[^\d]</i> to search for second streams of coronal holes.
					</p>
					Note: do not use comparison operations on enum type columns, use <u>regexp</u> instead. */}
				</div>}
					
				{infoPage === null && <div>
					<h2><a id="advanced" href="#advanced">Advanced usage</a></h2>
				The most cool functionality requires user to be authorized, in order to save changes and also to avoid server exploitation. If you want an account please email to <a href="mailto:izmiran.crdt@gmail.com">izmiran.crdt@gmail.com</a>.
					<h4>Making changes</h4>
				Operators can change table values, including ones that are computed from data. To do that one must set <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> to desired column and press Enter/Insert (or click the cell with mouse). Cell will turn into input field. When finished inputing the new value one should press Enter/Insert again (or click outside) for the change to actually apply. Inputs are validated according to corresponding column's data type, and ones that do not pass validation are marked with red. If entered value is valid it will apply locally (i.e. correlation plot will be redrawn with new data). But for changes to actually persist across sessions one must commit them by pressing <b>Ctrl + S</b> or a button under <button>Table</button> menu. A confirmation prompt will popup, listing all the changes that are being commited. One must ensure that list does not contain any unintended modifications, if it does one can discard specific changes using <span className='CloseButton' style={{ margin: 0, transform: 'none', fontSize: 16 }}>&times;</span> button. After confirm button is pressed, changes will be saved to the server and whole table data will be reloaded.
					<p>
					If all changes are wrong or were made locally as an experiment, one may discard all of them with the <b>Discard changes</b> button under <button>Table</button> menu.
					</p>
				Note that changes made to computed columns are persisted across computations. Thus, one should only change them if it's really necessary. Modified values of computed columns are marked with <span style={{ fontSize: '14px', display: 'inline-block', color: 'var(--color-magenta)', transform: 'translate(1px, -3px)' }}>*</span> asterisk. <b>In order to opt back to automatically computed value one should change cell value to special word: <span style={{ color: 'var(--color-active)' }}>auto</span></b>

					<h4>Creating custom samples</h4>
				Under <button>Sample</button> menu one can choose the sample to work with. Choose <i>None</i> to be able to create a new one. Note that the name of a sample is not restricted.
				
					<p>After sample is created one can add filters to it with <button>Add filter</button> button. Sample is stored on server in form of filters, the resulting list of events is computed in your browser. Thus, if events ids change sample will not break. But on the other hand if anything happens to columns that are involved in filters, the sample will not work as expected.</p>

				In order to add/remove specific events to the sample one should check into <b>editing mode</b>. When this mode is active, table will include special column that shows status of each event in respect to the sample: <b>f</b>: passes sample's filters; <span style={{ color: 'var(--color-cyan)' }}>+</span>: is whitelisted; 
					<span style={{ color: 'var(--color-magenta)' }}> -</span>: is blacklisted. Event can't be whitelisted and blacklisted at the same time. This column can be used to sort the table (just like with other columns). Use this to get to those filtered events that you want to blacklist.

					<p>
					To whitelist an event click on special columns cell of the desired row. Or press <b>+</b> (=) key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> stands in the desired row. To blacklist do the same but with <b>Ctrl + click</b> or <b>-</b> key.
					</p>
				
					<p>One can share ownership with co-authors by clicking on authors list and entering new list (separated by comma). All authors are equal in rights and they can for example remove you from your own sample (even you can't), so be careful there. One can also make the sample <b>public</b> so that it will be visible to anyone (only visible). <b>Beware that public sample will not work properly if it's filters involve generic columns that are not visible to everyone</b></p>

				Tip: Do not forget to <button>Save changes</button>.
					<h2><a id="generics" href="#generics">Comprehend generic columns</a></h2>
					<p>
					Generic columns is a name for powerful system that allows authorized users to dynamically create desired columns from data/ Press <b>{KEY_COMB.openGenericsSelector}</b> to open column creation menu, on the left you will see list of columns that you've already created (if any) with <u>recompute</u> <span className='CloseButton' style={{ margin: 0, transform: 'translateY(-3px)', color: 'var(--color-green)', fontSize: 16 }}>o</span> and <u>remove</u> <span className='CloseButton' style={{ margin: 0, transform: 'none', fontSize: 16 }}>&times;</span> buttons. On the right there will be the column creation form, which includes up to 7 inputs: 
					</p>
					<ul style={{  }}>
						<li><b>Entity</b> - target event. Defines the table that the column belongs to and sets the starting point as corresponding event's start;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>Type</b> - Defines what to compute (more details below);</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>Series</b> - Specifies which data series to use;</li>
						<li style={{ margin: '1em 0 .5em 0' }}><b>POI</b> - Point of Interest - defines target point in time. Optional for all types except <i>time_to*</i> and <i>clone</i>. Can be the start of an associated event or its end (if duration specified) or an extremum;</li>
						<li style={{ margin: '0 0 .5em 2em' }}><b>Extremum</b> - When POI = <i>&lt;Extremum&gt;</i> one must select the type of extremum;</li>
						<li style={{ margin: '0 0 0 2em' }}><b>of Series</b> - .. and data series in which to search for the extremum;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>Shift</b> - For <i>value</i> type specifies window in which to average (in hours from POI); For <i>time_to*</i> and <i>clone</i> types specifies offset <b>in events</b>. For the rest specifes POI shift in hours.</li>
					</ul>
					<h4>Available column types</h4>
					<ul style={{  }}>
						<li style={{ margin: '1em 0 1em 0' }}><b>time_to</b> - Time offset to POI in hours (can be negative);</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>time_to_%</b> - Same offset but in percents of event duration (only works for entities with explicit duration);</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>min, max, abs_min, abs_max</b> - Extremum value of series in <u>specified window</u>;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>mean, median</b> - Average value of given series in <u>specified window</u>;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>range</b> - Difference between max and min value of series in <u>specified window</u>;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>coverage</b> - Data coverage of series as percentage of <u>specified window</u>;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>value</b> - Value of specified variable at specific hour (shift from poi). See examples below;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>avg_value</b> - Value of specified variable averaged over specified period from poi. See examples below;</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>diff, abs_diff</b> - Difference between two columns values.</li>
						<li style={{ margin: '1em 0 1em 0' }}><b>clone</b> - Clone specified column value from next/previous events associated entity of selected type.</li>
					</ul>
					<p>
					One side of the <u>specified window</u> is event start hour, the other (not inclusive) is determined as follows: If <b>POI is not set</b> - start+duration if duration is set explicitly, else the closest of (the hour of next event onset or start + 72 (?) hours); If <b>POI is set</b> - poi hour (always round down) + shift if set.
					</p>
					<p>
					Note: Windows with POI (extremum, range etc) always round hours down. And right boundary is always not inclusive. It means that when window is oriented backwards in time (i.e. <i>MC min to associated FE</i>) it will always include whole FE start hour and not include MC start hour.
					</p>
					<p>
						<b>Value</b> rounds POI time up if shift is &gt; 0. Look at some examples. Event onset time is shown in parenthesis, resulting interval is shown on the right:
						<pre style={{ margin: '.5em 0 0 2em', lineHeight: '1.75em' }}>
						[ons]   (18:40) -&gt; 18:00<br/>
						[ons]+1 (18:00) -&gt; 18:00<br/>
						[ons]+1 (18:34) -&gt; 19:00<br/>
						[ons]+2 (18:00) -&gt; [18:00, 19:00]<br/>
						[ons]+2 (18:34) -&gt; [19:00, 20:00]<br/>
						[ons]-1 (18:00) -&gt; 17:00<br/>
						[ons]-1 (18:34) -&gt; 17:00<br/>
						[ons]-3 (18:00) -&gt; [15:00, 17:00]<br/>
						[ons]-3 (18:34) -&gt; [15:00, 17:00]<br/>
						</pre>
					</p>
					<p>
					If <i>value</i> interval is missing floor(len / 2) or more values, it is discarded.
					</p>

					<h2><a id="obscure" href="#obscure">Other obscure knowledge</a></h2>
					<h4>Histogram</h4>
				Histogram range is determined automatically based on sample. It can not know anything about your filters so it is left to work with [a;b] type intervals. The following algorithm is applied here: if samples maximum value is distinct (count=1), then it <u>is discarded</u>, otherwise the range is adjusted to include a separate bin of this maximum values. Such behavior is targeted at integer or stepped data like Kp or SStype.
				</div>}
				{infoPage === 'shortcuts' && <div style={{ lineHeight: '2em' }}>
					     <b>C</b> - Select Columns
					<br/><b>F</b> - Add Filter
					<br/><b>H</b> - Show this window
					<br/><b>T</b> - Switch application color theme
					<br/><b>L</b> - Switch application layout
					<br/><b>P</b> - Plot event at cursor, or set cursor to currently ploted event
					<br/><b>1</b> - Set X column for correlation or histogram from cursor
					<br/><b>2</b> - Set Y column for correlation or histogram from cursor
					<br/><b>K</b> - Re-compute row (acutally 3 rows)
					<br/><b>[</b> - Plot previous event
					<br/><b>]</b> - Plot next event
					<br/><b>&lt;</b> - Plot previous event from current sample
					<br/><b>&gt;</b> - Plot next event from current sample
					<br/><b>Ctrl+S</b> - Commit table changes
					<br/><b>Ctrl+X</b> - Discard table changes
				</div>}
				{infoPage === 'credit' && <div>
					<div style={{ paddingBottom: 8 }}>(c) IZMIRAN:</div>
					Anatoly Belov - Initial database author
					<br/> Semyon Belov&nbsp; - New program author
					<br/> Maria Abunina - Database contributions
					<br/> Nataly Shlyk&nbsp;  - Database contributions
					<p style={{ paddingTop: 8 }}>Please email with any questions/suggestions: <a href='mailto:izmiran.crdt@gmail.com'>izmiran.crdt@gmail.com</a></p>
					<h4>Plots Data sources</h4>
					OMNI Database of solar wind parameters: <a href='http://omniweb.gsfc.nasa.gov'>omniweb.gsfc.nasa.gov</a>
					<br/>Y.Yermolaev solar wind structures: <a href='http://iki.rssi.ru/omni/catalog'>iki.rssi.ru/omni/catalog</a>
				</div>}
			</div>
		</div>
	</>;
}