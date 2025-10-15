export function pointWithin(px, py, rlft, rtop, rrgt, rbtm) {
	return px >= rlft && px <= rrgt && py >= rtop && py <= rbtm;
}

const MAX_OBJECTS = 10;
const MAX_LEVELS = 4;

export class Quadtree {
	constructor(x, y, w, h, l) {
		const t = this;

		t.x = x;
		t.y = y;
		t.w = w;
		t.h = h;
		t.l = l || 0;
		t.o = [];
		t.q = null;
	}

	split() {
		const t = this,
			x = t.x,
			y = t.y,
			w = t.w / 2,
			h = t.h / 2,
			l = t.l + 1;

		t.q = [
			// top right
			new Quadtree(x + w, y, w, h, l),
			// top left
			new Quadtree(x, y, w, h, l),
			// bottom left
			new Quadtree(x, y + h, w, h, l),
			// bottom right
			new Quadtree(x + w, y + h, w, h, l),
		];
	}

	// invokes callback with index of each overlapping quad
	quads(x, y, w, h, cb) {
		const t = this,
			q = t.q,
			hzMid = t.x + t.w / 2,
			vtMid = t.y + t.h / 2,
			startIsNorth = y < vtMid,
			startIsWest = x < hzMid,
			endIsEast = x + w > hzMid,
			endIsSouth = y + h > vtMid;

		// top-right quad
		startIsNorth && endIsEast && cb(q[0]);
		// top-left quad
		startIsWest && startIsNorth && cb(q[1]);
		// bottom-left quad
		startIsWest && endIsSouth && cb(q[2]);
		// bottom-right quad
		endIsEast && endIsSouth && cb(q[3]);
	}

	add(o) {
		const t = this;

		if (t.q != null) {
			t.quads(o.x, o.y, o.w, o.h, (q) => {
				q.add(o);
			});
		} else {
			const os = t.o;

			os.push(o);

			if (os.length > MAX_OBJECTS && t.l < MAX_LEVELS) {
				t.split();

				for (let i = 0; i < os.length; i++) {
					const oi = os[i];

					t.quads(oi.x, oi.y, oi.w, oi.h, (q) => {
						q.add(oi);
					});
				}

				t.o.length = 0;
			}
		}
	}

	get(x, y, w, h, cb) {
		const t = this;
		const os = t.o;

		for (let i = 0; i < os.length; i++) cb(os[i]);

		if (t.q != null) {
			t.quads(x, y, w, h, (q) => {
				q.get(x, y, w, h, cb);
			});
		}
	}

	hover(cx, cy, cb) {
		let dist = Infinity;
		this.get(cx, cy, 1, 1, (o) => {
			if (pointWithin(cx, cy, o.x, o.y, o.x + o.w, o.y + o.h)) {
				const ocx = o.x + o.w / 2;
				const ocy = o.y + o.h / 2;

				const dx = ocx - cx;
				const dy = ocy - cy;

				const d = Math.sqrt(dx ** 2 + dy ** 2);

				// test against radius for actual hover
				if (d <= o.w / 2) {
					// only hover bbox with closest distance
					if (d <= dist) {
						dist = d;
						cb(o);
					}
				}
			}
		});
	}

	clear() {
		this.o.length = 0;
		this.q = null;
	}
}
