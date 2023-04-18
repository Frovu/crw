CREATE TABLE IF NOT EXISTS neutron_stations (
	id TEXT PRIMARY KEY,
	drift_longitude REAL,
	closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS neutron_counts (
	time TIMESTAMPTZ NOT NULL,
	obtain_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	station TEXT NOT NULL REFERENCES neutron_stations(id) ON DELETE CASCADE,
	original REAL,
	corrected REAL,
	pressure REAL,
	UNIQUE(time, station)
);

INSERT INTO neutron_stations(id, drift_longitude, closed_at) VALUES
('APTY',  73.05, NULL),
('CALG', 270.9,  NULL),
('CAPS', 213.5, '2014-11-01'),
('DRBS',  65.17, NULL),
('FSMT', 293.07, NULL),
('GSBY', 338.6, '2000-01-01'),
('INVK', 234.85, NULL),
('IRKT', 163.58, NULL),
('KERG',  89.71, NULL),
('KIEL2', 65.34, NULL),
('KGSN', 197.30, '2016-11-01'),
('LARC', 356.00, '2008-08-01'),
('MGDN', 196.00, '2018-02-01'),
('MWSN', 56.9,   NULL),
('NAIN',  18.32, NULL),
('NEWK', 331.49, NULL),
('NRLK', 124.48, NULL),
('NVBK', 136.0,  NULL),
('OULU',  67.42, NULL),
('PWNK', 349.56, NULL),
('SNAE', 17.2,   NULL),
('TXBY', 161.9,  NULL),
('YKTK', 174.02, NULL)
ON CONFLICT(id) DO NOTHING;