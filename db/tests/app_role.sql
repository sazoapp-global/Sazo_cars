-- The API's limited login (sazo_app, db/privileges.sql) can read and write rows, but cannot change history,
-- switch off the append-only protection, or change the database's structure.
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE role_results (test text, outcome text);
CREATE FUNCTION pg_temp.as_app(p_name text, p_sql text, p_errcode text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE sazo_app';
    EXECUTE p_sql;
    RAISE EXCEPTION 'statement succeeded' USING ERRCODE = 'P0001';  -- undo whatever it did
  EXCEPTION WHEN OTHERS THEN
    IF (p_errcode IS NULL AND SQLSTATE = 'P0001' AND SQLERRM = 'statement succeeded') OR SQLSTATE = p_errcode THEN
      INSERT INTO role_results VALUES (p_name, 'PASS');
    ELSE
      INSERT INTO role_results VALUES (p_name, 'FAIL (' || SQLSTATE || ': ' || SQLERRM || ')');
    END IF;
  END;
END $$;

SELECT pg_temp.as_app('R1 app reads vehicles', $q$SELECT count(*) FROM vehicle.vehicles$q$, NULL);
SELECT pg_temp.as_app('R2 app adds and changes ordinary rows', $q$INSERT INTO iam.permissions (code, description) VALUES ('zz.test', 'test'); UPDATE iam.permissions SET description = 'x' WHERE code = 'zz.test'$q$, NULL);
SELECT pg_temp.as_app('R3 app cannot update history (observations)', $q$UPDATE obs.observations SET attributes = '{}' WHERE false$q$, '42501');
SELECT pg_temp.as_app('R4 app cannot delete the audit log', $q$DELETE FROM iam.audit_entries WHERE false$q$, '42501');
SELECT pg_temp.as_app('R5 app cannot switch off the append-only protection', $q$ALTER TABLE obs.observations DISABLE TRIGGER trg_append_only$q$, '42501');
SELECT pg_temp.as_app('R6 app cannot create tables', $q$CREATE TABLE obs.zz_test (id int)$q$, '42501');
SELECT pg_temp.as_app('R7 app cannot drop tables', $q$DROP TABLE iam.users$q$, '42501');
SELECT pg_temp.as_app('R8 app cannot empty a table', $q$TRUNCATE report.saved_checks$q$, '42501');
SELECT pg_temp.as_app('R9 app cannot read the migration ledger', $q$SELECT * FROM public.sazo_migrations$q$, '42501');

SELECT test, outcome FROM role_results ORDER BY test COLLATE "C";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM role_results WHERE outcome <> 'PASS') THEN
    RAISE EXCEPTION 'app role tests failed: %', (SELECT string_agg(test || ' -> ' || outcome, '; ') FROM role_results WHERE outcome <> 'PASS');
  END IF;
END $$;
ROLLBACK;
