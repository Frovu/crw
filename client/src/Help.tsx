import './css/Table.css';

export default function Help() {
	return (<div style={{ padding: '1em 0 0 3em', maxWidth: '80ch', textAlign: 'justify' }}>
		<h4>Navigating the table</h4>
		<p>
			Table navigation is performed by moving the <span style={{ border: '1px var(--color-active) solid' }}>cursor</span> with <b>arrow keys</b>. Home, End, PgUp, PgDown work aswell. <b>Ctrl + Home/End</b> moves the cursor to the start/end of the table.
		</p>
		<p>
			Table can also be scrolled vertically using mousewheel, this unsets cursor when scrolled out of view.
		</p>
		<p>
			When <b>P</b> (plot) key is pressed and cursor is not set, cursor will be set to the <span style={{ color: 'var(--color-cyan)' }}>plotted line</span>
		</p>
	</div>);
}