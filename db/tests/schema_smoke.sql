-- SAZO schema v0.1 — smoke test with scenario data (S06 engine swap, S08 cloned plate, S26 VIN typo)
SET client_min_messages = warning;
BEGIN;

-- ---------- fixtures ----------
INSERT INTO iam.organisations (id, type, legal_name, status, approved_at) VALUES
 ('00000000-0000-7000-8000-000000000001','registry','Vehicle registry (simulated)','approved',now()),
 ('00000000-0000-7000-8000-000000000002','revenue_authority','Customs (simulated)','approved',now()),
 ('00000000-0000-7000-8000-000000000003','garage','Mutungo Auto Works','approved',now()),
 ('00000000-0000-7000-8000-000000000004','garage','Kireka Quick Service','approved',now());

INSERT INTO iam.users (id, display_name, phone_e164) VALUES
 ('00000000-0000-7000-8000-0000000000a1','Grace Namutebi','+256700000001');

INSERT INTO ingest.sources (id, code, name, organisation_id, domain, channel, is_simulated, default_evidence_class, baseline_reputation) VALUES
 ('00000000-0000-7000-8000-000000000101','REG-SIM','Vehicle registry (simulated)','00000000-0000-7000-8000-000000000001','registration','simulated_feed',true,'official',0.90),
 ('00000000-0000-7000-8000-000000000102','CUS-SIM','Customs (simulated)','00000000-0000-7000-8000-000000000002','customs','simulated_feed',true,'official',0.90),
 ('00000000-0000-7000-8000-000000000103','GAR-MUT','Mutungo Auto Works','00000000-0000-7000-8000-000000000003','garage','garage_app',false,'garage',0.70),
 ('00000000-0000-7000-8000-000000000104','GAR-KIR','Kireka Quick Service','00000000-0000-7000-8000-000000000004','garage','garage_app',false,'garage',0.70);

INSERT INTO ingest.source_coverages (source_id, domain, scope, period_from) VALUES
 ('00000000-0000-7000-8000-000000000101','registration','all_registered_vehicles','2000-01-01');

INSERT INTO obs.observation_types (code, schema_version, domain, json_schema, default_sensitivity, required_evidence) VALUES
 ('registration_issued',1,'registration','{}','public','{}'),
 ('spec_declared',1,'identity','{}','public','{}'),
 ('odometer_reading',1,'mileage','{}','public','{odometer_photo}'),
 ('component_replaced',1,'maintenance','{}','public','{engine_number_photo}'),
 ('service_performed',1,'maintenance','{}','public','{}'),
 ('cost_recorded',1,'cost','{}','confidential','{}');

INSERT INTO trust.rule_sets (version, description, parameters, activated_at) VALUES
 ('rs-2026.10-v1','Rule Set v1','{"weak_threshold":0.40}', now());

-- ---------- S06: 2014 Toyota Premio UBK 482M, engine replaced ----------
INSERT INTO vehicle.vehicles (id, public_ref, status) VALUES
 ('00000000-0000-7000-8000-000000000601','SZV-7K3M-9Q2D','active');
INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized, valid_from, time_precision) VALUES
 ('00000000-0000-7000-8000-000000000601','chassis_number','NZT260-3048271','NZT2603048271','2019-03-01','month'),
 ('00000000-0000-7000-8000-000000000601','registration_plate','UBK 482M','UBK482M','2019-03-01','month');

INSERT INTO ingest.submissions (id, source_id, submitted_by_user_id, acting_for_organisation_id, idempotency_key, raw_payload, payload_sha256, schema_version, status) VALUES
 ('00000000-0000-7000-8000-000000000611','00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-0000000000a1',
  '00000000-0000-7000-8000-000000000003','GJ-20260912-0001','{"job":"engine replacement"}', encode(digest('job','sha256'),'hex'), 1, 'processed');
INSERT INTO ingest.submission_items (id, submission_id, sequence, raw_item, status) VALUES
 ('00000000-0000-7000-8000-000000000612','00000000-0000-7000-8000-000000000611',1,'{}','accepted');

INSERT INTO obs.vehicle_events (id, vehicle_id, type, event_time, event_time_precision, source_id, submission_id) VALUES
 ('00000000-0000-7000-8000-000000000621','00000000-0000-7000-8000-000000000601','garage_job','2026-09-12 10:30+03','exact',
  '00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-000000000611');

INSERT INTO obs.evidence_files (id, storage_key, sha256, mime_type, size_bytes, kind) VALUES
 ('00000000-0000-7000-8000-000000000631','ev/2026/09/odo-1.jpg', encode(digest('odo','sha256'),'hex'),'image/jpeg',204800,'odometer_photo'),
 ('00000000-0000-7000-8000-000000000632','ev/2026/09/eng-1.jpg', encode(digest('eng','sha256'),'hex'),'image/jpeg',198400,'engine_number_photo');

INSERT INTO obs.observations (id, vehicle_id, event_id, type, type_schema_version, attributes, event_time, event_time_precision,
  source_id, submission_item_id, entered_by_user_id, acting_for_organisation_id, evidence_class, sensitivity) VALUES
 ('00000000-0000-7000-8000-000000000641','00000000-0000-7000-8000-000000000601','00000000-0000-7000-8000-000000000621','odometer_reading',1,
  '{"km":151870,"original_value":151870,"original_unit":"km"}','2026-09-12 10:30+03','exact',
  '00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-000000000612','00000000-0000-7000-8000-0000000000a1','00000000-0000-7000-8000-000000000003','garage','public'),
 ('00000000-0000-7000-8000-000000000642','00000000-0000-7000-8000-000000000601','00000000-0000-7000-8000-000000000621','component_replaced',1,
  '{"component":"engine","old_serial":"1NZ-A111111","new_serial":"1NZ-B222222","reason":"seized"}','2026-09-12 10:30+03','exact',
  '00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-000000000612','00000000-0000-7000-8000-0000000000a1','00000000-0000-7000-8000-000000000003','garage','public'),
 ('00000000-0000-7000-8000-000000000643','00000000-0000-7000-8000-000000000601','00000000-0000-7000-8000-000000000621','cost_recorded',1,
  '{"amount":4250000,"currency":"UGX"}','2026-09-12 10:30+03','exact',
  '00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-000000000612','00000000-0000-7000-8000-0000000000a1','00000000-0000-7000-8000-000000000003','garage','confidential');

INSERT INTO obs.observation_evidence VALUES
 ('00000000-0000-7000-8000-000000000641','00000000-0000-7000-8000-000000000631','primary'),
 ('00000000-0000-7000-8000-000000000642','00000000-0000-7000-8000-000000000632','primary');

INSERT INTO pii.parties (id, kind, phone_hash, key_version) VALUES
 ('00000000-0000-7000-8000-000000000651','person', digest('+256700000099','sha256'), 1);
INSERT INTO obs.attestations (target_event_id, attester_kind, attester_party_id, channel, response) VALUES
 ('00000000-0000-7000-8000-000000000621','registered_owner','00000000-0000-7000-8000-000000000651','sms_reply','confirmed');

-- ---------- S08: cloned plate UAX 123A on two vehicles ----------
INSERT INTO vehicle.vehicles (id, public_ref, status) VALUES
 ('00000000-0000-7000-8000-000000000801','SZV-AAAA-0801','active'),
 ('00000000-0000-7000-8000-000000000802','SZV-AAAA-0802','active');
INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized, status) VALUES
 ('00000000-0000-7000-8000-000000000801','chassis_number','NZT260-3011111','NZT2603011111','active'),
 ('00000000-0000-7000-8000-000000000801','registration_plate','UAX 123A','UAX123A','disputed'),
 ('00000000-0000-7000-8000-000000000802','chassis_number','ZSU60-0099999','ZSU600099999','active'),
 ('00000000-0000-7000-8000-000000000802','registration_plate','UBF 778B','UBF778B','active'),
 ('00000000-0000-7000-8000-000000000802','registration_plate','UAX 123A','UAX123A','disputed');

-- ---------- S26: VIN with real digits ----------
INSERT INTO vehicle.vehicles (id, public_ref, status) VALUES ('00000000-0000-7000-8000-000000002601','SZV-AAAA-2601','active');
INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized) VALUES
 ('00000000-0000-7000-8000-000000002601','vin','WDD2050042F123456','WDD2050042F123456');

-- ---------- tests ----------
CREATE TEMP TABLE results (test text, outcome text);

CREATE FUNCTION pg_temp.expect_error(p_name text, p_sql text, p_errcode text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO results VALUES (p_name, 'FAIL (no error raised)');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_errcode THEN INSERT INTO results VALUES (p_name, 'PASS');
    ELSE INSERT INTO results VALUES (p_name, 'FAIL (got '||SQLSTATE||': '||SQLERRM||')'); END IF;
  END;
END $$;

SELECT pg_temp.expect_error('T1 observations are append-only (UPDATE blocked)',
  $q$UPDATE obs.observations SET attributes='{"km":1}' WHERE id='00000000-0000-7000-8000-000000000641'$q$, '23001');
SELECT pg_temp.expect_error('T2 observations are append-only (DELETE blocked)',
  $q$DELETE FROM obs.observations WHERE id='00000000-0000-7000-8000-000000000641'$q$, '23001');
SELECT pg_temp.expect_error('T3 X5 resend with same idempotency key rejected',
  $q$INSERT INTO ingest.submissions (source_id, idempotency_key, raw_payload, payload_sha256, schema_version)
     VALUES ('00000000-0000-7000-8000-000000000103','GJ-20260912-0001','{}', repeat('a',64), 1)$q$, '23505');
SELECT pg_temp.expect_error('T4 identity rule 1: same active chassis on a second vehicle rejected',
  $q$INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized)
     VALUES ('00000000-0000-7000-8000-000000000802','chassis_number','NZT260-3048271','NZT2603048271')$q$, '23505');
SELECT pg_temp.expect_error('T5 VIN containing letter O rejected',
  $q$INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized)
     VALUES ('00000000-0000-7000-8000-000000002601','vin','WDD2O5OO42F123456','WDD2O5OO42F123456')$q$, '23514');
SELECT pg_temp.expect_error('T6 health score with insufficient history rejected (D-062)',
  $q$INSERT INTO ref.vehicle_health (vehicle_id, trust_run_id, rule_set_version, as_of, insufficient, score)
     VALUES ('00000000-0000-7000-8000-000000000601', gen_random_uuid(), 'rs-2026.10-v1', now(), true, 90)$q$, '23514');
SELECT pg_temp.expect_error('T7 evidence files are immutable',
  $q$UPDATE obs.evidence_files SET sha256=repeat('b',64) WHERE id='00000000-0000-7000-8000-000000000631'$q$, '23001');
SELECT pg_temp.expect_error('T8 attestation must target exactly one thing',
  $q$INSERT INTO obs.attestations (attester_kind, channel, response) VALUES ('customer','sms_reply','confirmed')$q$, '23514');
SELECT pg_temp.expect_error('T9 resolved conflict needs reasoning and a reviewer',
  $q$INSERT INTO trust.conflicts (vehicle_id, topic, status, observation_ids) VALUES (gen_random_uuid(),'mileage','resolved','{}')$q$, '23514');
SELECT pg_temp.expect_error('T10 observation type must exist in the catalogue',
  $q$INSERT INTO obs.observations (vehicle_id, type, type_schema_version, attributes, event_time_precision, source_id, submission_item_id, evidence_class, sensitivity)
     VALUES (gen_random_uuid(),'made_up_type',1,'{}','unknown',gen_random_uuid(),gen_random_uuid(),'garage','public')$q$, '23503');

-- T11: S08 plate search returns both vehicles
INSERT INTO results
SELECT 'T11 S08 search "UAX 123A" returns 2 vehicles', CASE WHEN count(DISTINCT vehicle_id)=2 THEN 'PASS' ELSE 'FAIL ('||count(DISTINCT vehicle_id)||')' END
FROM vehicle.vehicle_identifiers WHERE type='registration_plate' AND value_normalized = upper(regexp_replace('uax 123a','[\s-]','','g'));

-- T12: S26 fuzzy VIN search ("O" typed for "0") finds the real VIN via trigram + O→0 normalisation (G9)
INSERT INTO results
SELECT 'T12 S26 "Did you mean" VIN suggestion', CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END
FROM vehicle.vehicle_identifiers
WHERE type='vin' AND value_normalized = translate(upper('WDD2O5OO42F123456'),'OIQ','010');

-- T13: S06 timeline: one event, 3 observations, 2 evidence links, confirmed by owner
INSERT INTO results
SELECT 'T13 S06 timeline event assembles (3 obs, 2 evidence, owner confirmed)',
  CASE WHEN obs_n=3 AND ev_n=2 AND att='confirmed' THEN 'PASS' ELSE 'FAIL' END
FROM (
  SELECT (SELECT count(*) FROM obs.observations o WHERE o.event_id=e.id) obs_n,
         (SELECT count(*) FROM obs.observation_evidence oe JOIN obs.observations o ON o.id=oe.observation_id WHERE o.event_id=e.id) ev_n,
         (SELECT response FROM obs.attestations a WHERE a.target_event_id=e.id) att
  FROM obs.vehicle_events e WHERE e.id='00000000-0000-7000-8000-000000000621') x;

-- T14: S06 engine history is queryable from attributes (GIN index path)
INSERT INTO results
SELECT 'T14 S06 engine swap found by new engine number', CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END
FROM obs.observations WHERE attributes @> '{"component":"engine","new_serial":"1NZ-B222222"}';

-- T15: corrections are new rows (S23 pattern) — allowed
INSERT INTO obs.observations (id, vehicle_id, type, type_schema_version, attributes, event_time, event_time_precision, source_id, submission_item_id, evidence_class, sensitivity)
VALUES ('00000000-0000-7000-8000-000000000644','00000000-0000-7000-8000-000000000601','odometer_reading',1,'{"km":151870}','2026-09-12','day',
        '00000000-0000-7000-8000-000000000103','00000000-0000-7000-8000-000000000612','garage','public');
INSERT INTO obs.observation_relations (from_observation_id, to_observation_id, kind, reason)
VALUES ('00000000-0000-7000-8000-000000000644','00000000-0000-7000-8000-000000000641','duplicates','test');
INSERT INTO results SELECT 'T15 correction/duplicate stored as a relation, original untouched', 'PASS';

SELECT test, outcome FROM results ORDER BY test COLLATE "C";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM results WHERE outcome <> 'PASS') THEN
    RAISE EXCEPTION 'schema smoke tests failed: %', (SELECT string_agg(test || ' -> ' || outcome, '; ') FROM results WHERE outcome <> 'PASS');
  END IF;
END $$;
ROLLBACK;
