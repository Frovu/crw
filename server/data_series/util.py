def integrity_query(t_from, t_to, period, tables, test_columns, time_column='time',
	bad_condition=False, bad_cond_columns=[], join_overwrite=False, where='', return_epoch=True):
	if type(test_columns) is not list:
		test_columns = [test_columns]
	if not join_overwrite and type(tables) is not list:
		tables = [tables]
	not_null_cond = ' AND '.join([f'{c} IS NOT NULL' for c in test_columns])
	null_cond = ' OR '.join([f'{c} IS NULL' for c in test_columns])
	join_tables = join_overwrite or '\n\t'.join( \
		[f'LEFT JOIN {t} ON (ser.tm = {t}.{time_column}){(" AND "+where) if where else ""}' for t in tables])
	return f'''WITH RECURSIVE
input (t_from, t_to, t_interval) AS (
	VALUES (to_timestamp({t_from}), to_timestamp({t_to}), interval \'{period} s\')
), filled AS (
	SELECT
		ser.tm as time, {','.join(test_columns + bad_cond_columns)}
	FROM
		(SELECT generate_series(t_from, t_to, t_interval) tm FROM input) ser
		{join_tables}
	ORDER BY time
), rec AS (
	SELECT
		t_from AS gap_start, t_from-t_interval AS gap_end
	FROM input
	UNION
	SELECT
		gap_start,
		COALESCE((SELECT time-t_interval FROM filled
			WHERE ({f"NOT ({bad_condition}) AND" if bad_condition else ""} {not_null_cond})
				AND time > gap_start LIMIT 1),t_to) AS gap_end
	FROM (
		SELECT
			(SELECT time FROM filled WHERE ({f"({bad_condition}) OR" if bad_condition else ""} {null_cond})
				AND time > gap_end LIMIT 1) AS gap_start
		FROM rec, input
		WHERE gap_end < t_to
	) r, input )
SELECT {", ".join([f"EXTRACT(EPOCH FROM {f})::integer" if return_epoch else f for f in ["gap_start", "gap_end"]])}
FROM rec WHERE gap_end - gap_start >= interval \'{period} s\' OR (gap_end = gap_start AND EXTRACT(EPOCH FROM gap_end)::integer%{period}=0);'''
