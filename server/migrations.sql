START TRANSACTION;

ALTER TABLE events.donki_flares ADD COLUMN IF NOT EXISTS tmp TEXT;
UPDATE events.donki_flares SET tmp = array_to_string(linked_events, ',');
ALTER TABLE events.donki_flares DROP COLUMN linked_events;
ALTER TABLE events.donki_flares RENAME COLUMN tmp TO linked_events;

ALTER TABLE events.donki_cmes ADD COLUMN IF NOT EXISTS tmp TEXT;
UPDATE events.donki_cmes SET tmp = array_to_string(linked_events, ',');
ALTER TABLE events.donki_cmes DROP COLUMN linked_events;
ALTER TABLE events.donki_cmes RENAME COLUMN tmp TO linked_events;

ALTER TABLE events.r_c_icmes ADD COLUMN IF NOT EXISTS tmp TEXT;
UPDATE events.r_c_icmes SET tmp = (SELECT array_to_string(array_agg(TO_CHAR(cmes, 'YYYY-MM-DD"T"HH24:MI:SSZ')), ',') FROM unnest(cmes_time) AS cmes);
ALTER TABLE events.r_c_icmes DROP COLUMN cmes_time;
ALTER TABLE events.r_c_icmes RENAME COLUMN tmp TO cmes_time;

COMMIT;