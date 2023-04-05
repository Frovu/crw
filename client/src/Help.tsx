import './css/Table.css';
import { KEY_COMB } from './table/TableMenu';

export default function Help() {
	return (<div style={{ padding: '1em 0 20em 3em', maxWidth: '80ch', textAlign: 'justify' }}>
		<a href='../'>..to application</a>
		<h2>Basic usage</h2>
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
			Note: do not use comparison operations on enum type columns, use <u>in list</u> or <u>regexp</u> instead.
		</p>
		<h4>Drawing beautiful plots</h4>
		<p>
			Before drawing anything one should decide what he wants to see. Plotting interface setup is done under <button>Plot</button> menu tab. One can draw up to 3 plots simultaneously: two on the right (<u>top</u> and <u>bottom</u>) and one below the table (<u>left</u>). Select which type of plot goes where in the menu. One can also change relative size of plots in the same menu. While <u>height</u> setting is straightforward, the <u>right plots width</u> also affects height of the left plot. Just play with the values and it will become clear.
		</p>
		<p>
			Statistical plots can be drawn with <b>{KEY_COMB.switchViewPlots}</b> key without selecting any event. To draw any other plot one should press <b>{KEY_COMB.plot}</b> key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> stands in the desired row of the table. After that one can plot previous or next event by using square bracket keys (note that this does not respect applied filters). When event plots are not needed anymore, one can toggle them off using <b>{KEY_COMB.switchViewPlots}</b> key.
		</p>
		<p>
			Tip: press <b>1-3</b> key while staning in a table cell to quickly adjust histogram or correlation to corresponding column.
		</p>
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
		<h2>Parameters description</h2>
		<p>Parameters description?</p>
		<h2>Advanced usage</h2>
		<h4>Comprehend generic columns</h4>
		<p>
			WIP
		</p>
		<p>
			For clone and offset (time_to*) columns shift value defines shift in events for all the rest it is shift in hours from POI.
		</p>
		<p>
			Extremum search with bound as POI always rounds down
		</p>
		<h4>Manage samples</h4>

		<h2>Other obscure knowledge</h2>
		<h4>Histogram</h4>
		Histogram range is determined automatically based on sample. It can not know anything about your filters so it is left to work with [a;b] type intervals. The following algorithm is applied here: if samples maximum value is distinct (count=1), then it <u>is discarded</u>, otherwise the range is adjusted to include a separate bin of this maximum values. Such behavior is targeted at integer or stepped data like Kp or SStype.
	</div>);
}