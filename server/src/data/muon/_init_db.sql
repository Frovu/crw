CREATE SCHEMA IF NOT EXISTS muon;

CREATE TABLE IF NOT EXISTS muon.experiments (
	id SERIAL PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	lat REAL NOT NULL,
	lon REAL NOT NULL,
	elevation_m REAL NOT NULL,
	operational_since timestamptz NOT NULL,
	operational_until timestamptz
);

CREATE TABLE IF NOT EXISTS muon.channels (
	id SERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	experiment TEXT NOT NULL REFERENCES muon.experiments (name) ON DELETE CASCADE,
	angle_vertical REAL DEFAULT 0,
	angle_azimuthal REAL DEFAULT 0,
	correction_info JSON,
	UNIQUE(experiment, name)
);

CREATE TABLE IF NOT EXISTS muon.conditions_data (
	experiment INTEGER NOT NULL REFERENCES muon.experiments ON DELETE CASCADE,
	time timestamptz NOT NULL,
	t_mass_average REAL,
	pressure REAL,
	UNIQUE(experiment, time)
);

CREATE TABLE IF NOT EXISTS muon.counts_data (
	channel INTEGER NOT NULL REFERENCES muon.channels ON DELETE CASCADE,
	time timestamptz NOT NULL,
	original REAL,
	revised REAL,
	UNIQUE(channel, time)
);

INSERT INTO muon.experiments(lat, lon, elevation_m, name, operational_since, operational_until) VALUES
(55.47, 37.32, 190, 'Moscow-cell',    '2020-08-26', '2022-02-01'),
(55.47, 37.32, 190, 'Moscow-pioneer', '2022-02-05', null),
(55.47, 37.32, 190, 'Moscow-CUBE',    '2007-10-23', null),
(67.57, 33.39, 181, 'Apatity',        '2020-11-26', null),
(78.06, 14.22, 70,  'Barentsburg',    '2021-10-03', null)
ON CONFLICT(name) DO NOTHING;

INSERT INTO muon.channels(experiment, name, angle_vertical, angle_azimuthal) VALUES
('Moscow-pioneer', 'V' , 0, 0),
('Moscow-cell', 'V' , 0, 0),
('Moscow-CUBE', 'V' , 0, 0),
('Apatity', 'V' , 0, 0),
('Barentsburg', 'V' , 0, 0)
ON CONFLICT(experiment, name) DO NOTHING;