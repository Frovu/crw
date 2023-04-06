import './css/Table.css';
import { KEY_COMB } from './table/TableMenu';

export default function Help() {
	return (<div style={{ padding: '1em 0 20em 3em', maxWidth: '80ch', textAlign: 'justify' }}>
		<a id="top" href='../'>..to application</a>
		<h2><a id="basic" href="#basic">Basic usage</a></h2>
		<h4>Setting up table</h4>
		<p>
			Table only shows columns explicitly selected by user. Columns are selected in special menu, which can be opened under <button>Table</button> menu, or using <b>{KEY_COMB.openColumnsSelector}</b> key. One can click on table names to toggle many columns at once.
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
			Statistical plots can be drawn with <b>{KEY_COMB.switchViewPlots}</b> key without selecting any event. To draw any other plot one should press <b>{KEY_COMB.plot}</b> key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> stands in the desired row of the table. After that one can plot previous or next event by using square bracket keys (note that this does not respect applied filters). When event plots are not needed anymore, one can toggle them off using <b>{KEY_COMB.switchViewPlots}</b> key.
		</p>
		<p>
			Tip: press <b>1-3</b> key while staning in a table cell to quickly adjust histogram or correlation to corresponding column. Press again to unset histogram column.
		</p>
			Tip: Press <b>{KEY_COMB.switchHistCorr}</b> to cycle between Histogram and Correlation plots.
		<p>
			Application provides three color themes, bright and monochrome themes are primarily intended to be used for exporting plot pictures. <b>{KEY_COMB.switchTheme}</b> key can be used to swiftly cycle between themes. In <button>Plot</button> menu dropdown one can also toggle plot grid and series markers on/off.
		</p>
		<p>
			Tip: alt + click on plot to download it as .png
		</p>

		<h4>Downloading data</h4>
		<p>
			Table data can be exported for private use. Under <button>Export</button> menu one can find file format switch and <i>apply filters</i> checkbox. Two supported format options are JSON and plain text, the first should be preferred because it allows to preserve whitespace in values, includes additional column information and is easier to handle with a program. Usually exported file will include only rows and columns that are currently visible in table interface (respecting selected sample and filters). One can download whole table data by unchecking this checkbox, tho we advice against doing so. Data can also be accessed via API directly, if you are willing to use it please email to <a href="mailto:izmiran.crdt@gmail.com">izmiran.crdt@gmail.com</a>.
		</p>
		{/* <h2>Parameters description</h2>
		<p>Parameters description?</p>
		<h2><a id="advanced" href="#advanced">Advanced usage</a></h2>
		<h4>Manage samples</h4> */}
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
			<li style={{ margin: '1em 0 1em 0' }}><b>value</b> - Value of specified variable averaged over specified period from poi. See examples below;</li>
			<li style={{ margin: '1em 0 1em 0' }}><b>clone</b> - Clone specified column value from next/previous events.</li>
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
		<p style={{ marginTop: '3em ' }}>
			<a href='#top'>..to the top</a>
		</p>
	</div>);
}