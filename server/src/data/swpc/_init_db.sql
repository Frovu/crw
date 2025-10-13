CREATE SCHEMA IF NOT EXISTS swpc;

CREATE TABLE IF NOT EXISTS swpc.daily_summary (
	time timestamptz PRIMARY KEY,
	disturbance_observed TEXT,
	disturbance_arrival TEXT
);