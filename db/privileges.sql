-- Database logins (applied by db/migrate.mjs after every migration run; safe to repeat).
--
-- The account that runs migrations OWNS every table. The running API must NOT use it: an owner can switch
-- off the append-only protection (ALTER TABLE … DISABLE TRIGGER), drop tables or rewrite history.
-- The API connects as `sazo_app` instead, which can only read and write rows:
--   • SELECT / INSERT / UPDATE / DELETE on module tables, and use their sequences;
--   • no UPDATE / DELETE / TRUNCATE at all on append-only tables (history, evidence, audit log);
--   • no CREATE, ALTER, DROP, no access to the migration ledger.
-- In production give it a password once: ALTER ROLE sazo_app LOGIN PASSWORD '…'; and use it in the API's DATABASE_URL.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sazo_app') THEN
    CREATE ROLE sazo_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace
            WHERE nspname NOT IN ('public', 'information_schema') AND nspname NOT LIKE 'pg\_%'
              AND pg_get_userbyid(nspowner) = current_user
  LOOP
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM sazo_app', s);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO sazo_app', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO sazo_app', s);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA %I FROM sazo_app', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO sazo_app', s);
  END LOOP;
END $$;

-- History stays history even if a bug or a stolen app password tries otherwise (D-020).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT DISTINCT event_object_schema AS s, event_object_table AS n FROM information_schema.triggers WHERE trigger_name = 'trg_append_only'
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I.%I FROM sazo_app', t.s, t.n);
  END LOOP;
END $$;

REVOKE ALL ON public.sazo_migrations FROM sazo_app;
REVOKE CREATE ON SCHEMA public FROM sazo_app;
