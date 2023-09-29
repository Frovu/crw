CREATE SCHEMA IF NOT EXISTS neutron;
CREATE SCHEMA IF NOT EXISTS nm;

CREATE TABLE IF NOT EXISTS neutron.stations (
	id TEXT PRIMARY KEY,
	provides_1min BOOLEAN NOT NULL DEFAULT true,
	prefer_nmdb BOOLEAN NOT NULL DEFAULT true,
	closed_at TIMESTAMPTZ,

	drift_longitude REAL
);

CREATE TABLE IF NOT EXISTS neutron.result (
	time TIMESTAMPTZ PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS neutron.integrity_state (
	id INT PRIMARY KEY,
	full_from INTEGER,
	full_to INTEGER,
	partial_from INTEGER,
	partial_to INTEGER
);
INSERT INTO neutron.integrity_state(id) VALUES(1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS neutron.obtain_log (
	id SERIAL PRIMARY KEY,
	time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	stations TEXT[],
	source TEXT NOT NULL,
	interval_start TIMESTAMPTZ NOT NULL,
	interval_end TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS neutron.revision_log (
	id SERIAL PRIMARY KEY,
	time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	author TEXT,
	comment TEXT,
	station TEXT NOT NULL,
	rev_time TIMESTAMPTZ[] NOT NULL,
	rev_value REAL[] NOT NULL,
	reverted_at TIMESTAMPTZ
);

INSERT INTO neutron.stations(id, drift_longitude, prefer_nmdb, closed_at) VALUES
('APTY',  73.05, 't', NULL),
('CALG',  270.9, 't', NULL),
('CAPS',  213.5, 'f', '2014-11-01'),
('DRBS',  65.17, 't', NULL),
('FSMT', 293.07, 't', NULL),
('GSBY',  338.6, 'f', '2000-01-01'),
('INVK', 234.85, 't', NULL),
('IRKT', 163.58, 't', NULL),
('KERG',  89.71, 't', NULL),
('KIEL2', 65.34, 't', NULL),
('KGSN', 197.30, 'f', '2016-11-01'),
('LARC', 356.00, 'f', '2008-08-01'),
('MGDN', 196.00, 'f', '2018-02-01'),
('NAIN',  18.32, 't', NULL),
('NEWK', 331.49, 't', NULL),
('NVBK',  136.0, 'f', NULL),
('OULU',  67.42, 't', NULL),
('PWNK', 349.56, 't', NULL),
('SNAE',   17.2, 'f', NULL),
('TXBY',  161.9, 't', NULL),
('YKTK', 174.02, 't', NULL)
ON CONFLICT(id) DO NOTHING;