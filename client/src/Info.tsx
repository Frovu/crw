import { useEffect, useRef } from 'react';
import { KEY_COMB, color, infoPages, useAppSettings } from './app';
import './styles/Table.css';
import { useEventListener } from './util';
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
			scrollRef.current.scrollTop = useInfoState.getState().scrollPos;
	}, []);

	useEventListener('escape', closeInfo);

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
				onScroll={e => setScrollPos((e as any).target.scrollTop)}>
				{(infoPage === 'manual' || infoPage === 'advanced') && <div>
					The detailed manual is not ready yet.<br/>
					For now please email to <a href='mailto:izmiran.crdt@gmail.com'>izmiran.crdt@gmail.com</a> with any questions.	
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
				{infoPage === null && <div>
					<h4>Setting up table</h4>
					<p>
					Table only shows colhumns explicitly selected by user. Columns are selected in special menu, which can be opened under <button>Table</button> menu, or using <b>{KEY_COMB.openColumnsSelector}</b> key. One can click on table names to toggle many columns at once.
					</p>
					<p>
					Table ordering can be performed only by one column. To toggle sorting click at column name in table header. Highlight on the bottom shows sorting in ascending order, on the top - in descending order.
					</p>
					<h4>Navigating the table</h4>
					<p>
					Table navigation is performed by moving the <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> with <b>arrow keys</b>. Home, End, PgUp, PgDown work aswell. <b>Ctrl + Home/End</b> moves the cursor to the start/end of the table. Table can also be scrolled vertically using mousewheel, this unsets cursor when scrolled out of view.
					</p>
					<p>
					Tip: When <b>{KEY_COMB.plot}</b> (plot) key is pressed and cursor is not set, cursor will be set to the <span style={{ color: 'var(--color-cyan)' }}>plotted row</span>. Press Escape first to ensure cursor removal.
					</p>
					<h4>One who seeks shall find</h4>
					<p>
					Filters allow one to reduce sample to the most interesting events. Press <b>F</b> key to create a new filter and <b>R</b> to remove last filter. Note that new filter's column and value will be copied from <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> if it is present. Filter cards are located above the table and consist of three inputs: column, operator and value. Filters number is not limited and they are always applied so that each row must pass all filters (logical AND).
					</p>
					<p>
					If you seek for some OR like behavior, <u>regexp</u> filter operators might come in handy. <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet">Regular expressions</a> are a powerful search and filter tool, just look at some examples: <i>okay|high</i> to filter for SStype confindence; <i>^(4|7|9)$</i> to include deifferent SStypes; <i>CH.*_2[^\d]</i> to search for second streams of coronal holes.
					</p>
					<p>
					If this variety somehow does not fulfil your filtering needs, custom samples got you covered with per-event whitelist and blacklist. If any sample is selected under <button>Sample</button> menu, table filters will be applied to this sample to further reduce it.
					</p>
					<p>
					Note: do not use comparison operations on enum type columns, use <u>regexp</u> instead.
					</p>
					<h4>Drawing beautiful plots</h4>
					<p>
					Before drawing anything one should decide what he wants to see. Plotting interface setup is done under <button>Plot</button> menu tab. One can draw up to 3 plots simultaneously: two on the right (<u>top</u> and <u>bottom</u>) and one below the table (<u>left</u>). Select which type of plot goes where in the menu. One can also change relative size of plots in the same menu. While <u>height</u> setting is straightforward, the <u>right plots width</u> also affects height of the left plot. Just play with the values and it will become clear.
					</p>
					<p>
					Tip: use <b>Ctrl + arrows</b> to change layout swiftly.
					</p>
					<p>
					Statistical plots can be drawn with <b>{KEY_COMB.switchViewPlots}</b> key without selecting any event. To draw any other plot one should press <b>{KEY_COMB.plot}</b> key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> stands in the desired row of the table. After that one can plot previous or next event by using square bracket keys (note that this does not respect applied filters). When event plots are not needed anymore, one can toggle them off using <b>{KEY_COMB.switchViewPlots}</b> key.
					</p>
				Tip: use <b>&lt; &gt;</b> keys to plot pervious/next event in applied sample, or <b>[ ]</b> across all events.
					<p>
					Tip: press <b>1-3</b> key while staning in a table cell to quickly adjust histogram or correlation to corresponding column. Press again to unset histogram column.
					</p>
					Tip: Press <b>{KEY_COMB.switchHistCorr}</b> to cycle between Histogram and Correlation plots.
					<p>
					Application provides three color themes, bright and monochrome themes are primarily intended to be used for exporting plot pictures. <b>{KEY_COMB.switchTheme}</b> key can be used to swiftly cycle between themes. In <button>Plot</button> menu dropdown one can also toggle plot grid and series markers on/off.
					</p>
					<p>
					Tip: <b>Ctrl + click</b> on a plot to open it as an image in a new tab, or <b>Alt + click</b> to instantly download it as .png
					</p>
					<p>
					Tip: Pressing <b>Ctrl + 1/2/3</b> and then pressing a digit allows one to change plot (top/bottom/left) type using keyboard, numbers correspond to the same list as seen in menu.
					</p>

					<h4>Downloading data</h4>
					<p>
					Table data can be exported for private use. Under <button>Export</button> menu one can find file format switch and <i>apply filters</i> checkbox. Two supported format options are JSON and plain text, the first should be preferred because it allows to preserve whitespace in values, includes additional column information and is easier to handle with a program. Usually exported file will include only rows and columns that are currently visible in table interface (respecting selected sample and filters). One can download whole table data by unchecking this checkbox, tho we advice against doing so. Data can also be accessed via API directly, if you are willing to use it please email to <a href="mailto:izmiran.crdt@gmail.com">izmiran.crdt@gmail.com</a>.
					</p>
					{/* <h2>Parameters description</h2>
				<p>Parameters description?</p> */}
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