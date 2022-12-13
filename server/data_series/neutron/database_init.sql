CREATE TABLE IF NOT EXISTS neutron_stations (
	id SERIAL PRIMARY KEY,
	short_name TEXT NOT NULL UNIQUE,
	drift_longitude REAL
);
CREATE TABLE IF NOT EXISTS neutron_counts (
	time TIMESTAMPTZ NOT NULL,
	obtain_time TIMESTAMPTZ NOT NULL,
	station_id INTEGER NOT NULL REFERENCES neutron_stations(id) ON DELETE CASCADE,
	original REAL,
	corrected REAL,
	pressure REAL,
	UNIQUE(time, station_id)
);

INSERT INTO neutron_stations(short_name, drift_longitude) VALUES
('APTY',  73.05),
('DRBS',  65.17),
('FSMT', 293.07),
('INVK', 234.85),
('IRKT', 163.58),
('KERG',  89.71),
('KIEL2', 65.34),
('NAIN',  18.32),
('NEWK', 331.49),
('NRLK', 124.48),
('OULU',  67.42),
('PWNK', 349.56),
('YKTK', 174.02)
ON CONFLICT(short_name) DO NOTHING;