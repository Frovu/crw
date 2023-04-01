import './css/Table.css';
import { KEY_COMB } from './table/TableMenu';

export default function Help() {
	return (<div style={{ padding: '1em 0 0 3em', maxWidth: '80ch', textAlign: 'justify' }}>
		<a href='../'>..to application</a>
		<h4>Navigating the table</h4>
		<p>
			Table navigation is performed by moving the <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> with <b>arrow keys</b>. Home, End, PgUp, PgDown work aswell. <b>Ctrl + Home/End</b> moves the cursor to the start/end of the table.
		</p>
		<p>
			Table can also be scrolled vertically using mousewheel, this unsets cursor when scrolled out of view.
		</p>
		<p>
			When <b>{KEY_COMB.plot}</b> (plot) key is pressed and cursor is not set, cursor will be set to the <span style={{ color: 'var(--color-cyan)' }}>plotted row</span>
		</p>
		<h4>Drawing beautiful plots</h4>
		<p>
			Before drawing anything one should decide what he wants to see. Plotting interface setup is done under <button>Plot</button> menu tab. One can draw up to 3 plots simultaneously: two on the right (<u>top</u> and <u>bottom</u>) and one below the table (<u>left</u>). Select which type of plot goes where in the menu. One can also change relative size of plots in the same menu. While <u>height</u> setting is straightforward, the <u>right plots width</u> also affects height of the left plot. Just play with the values and it will become clear.
		</p>
		<p>
			Statistical plots can be drawn without selecting any event using <b>{KEY_COMB.switchViewPlots}</b> key. To draw any other plot one should press <b>{KEY_COMB.plot}</b> key while <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> stands in the desired row of the table. After that one can plot previous or next event by using square bracket keys (note that this does not respect applied filters). When event plots are not needed anymore, one can toggle them off using <b>{KEY_COMB.switchViewPlots}</b> key.
		</p>
	</div>);
}