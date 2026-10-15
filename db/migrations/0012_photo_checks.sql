-- X-01: every photo is checked for what it shows. Checks are append-only facts about an evidence file:
-- what an automatic check found, and later what a SAZO reviewer decided. A photo "needs checking" while
-- it has a flag and no reviewer decision after it. Flagged photos don't count as evidence for a record
-- (so the record carries lower Record Confidence) until a reviewer clears them.
CREATE TABLE obs.evidence_checks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_file_id  uuid NOT NULL REFERENCES obs.evidence_files(id),
  check_name        text NOT NULL CHECK (check_name IN ('duplicate','quality','capture_time','content','review')),
  outcome           text NOT NULL CHECK (outcome IN ('pass','flag','cleared','rejected')),
  reason            text,
  detail            jsonb NOT NULL DEFAULT '{}',
  reviewer_user_id  uuid,                                   -- iam.users, for check_name = 'review'
  checked_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((check_name = 'review') = (outcome IN ('cleared','rejected')))
);
CREATE INDEX ON obs.evidence_checks (evidence_file_id, checked_at);
CREATE INDEX ON obs.evidence_checks (checked_at) WHERE outcome = 'flag';
SELECT platform.append_only('obs.evidence_checks');

-- A 64-bit picture fingerprint (difference hash): near-identical photos have fingerprints a few bits apart,
-- which catches a photo re-used after cropping, resizing or re-saving.
CREATE TABLE obs.evidence_fingerprints (
  evidence_file_id  uuid PRIMARY KEY REFERENCES obs.evidence_files(id),
  kind              text NOT NULL,
  dhash             bigint NOT NULL,
  width             int NOT NULL,
  height            int NOT NULL
);
CREATE INDEX ON obs.evidence_fingerprints (kind);
SELECT platform.append_only('obs.evidence_fingerprints');

-- Where each photo stands: ok (no flags), needs_checking (flagged, no reviewer decision since),
-- cleared or rejected (the latest reviewer decision).
CREATE VIEW obs.evidence_status AS
SELECT f.id AS evidence_file_id,
       CASE WHEN rv.outcome = 'rejected' THEN 'rejected'
            WHEN fl.last_flag IS NOT NULL AND (rv.checked_at IS NULL OR rv.checked_at < fl.last_flag) THEN 'needs_checking'
            WHEN rv.outcome = 'cleared' THEN 'cleared'
            ELSE 'ok' END AS status
  FROM obs.evidence_files f
  LEFT JOIN LATERAL (SELECT max(c.checked_at) AS last_flag FROM obs.evidence_checks c
                      WHERE c.evidence_file_id = f.id AND c.outcome = 'flag') fl ON true
  LEFT JOIN LATERAL (SELECT c.outcome, c.checked_at FROM obs.evidence_checks c
                      WHERE c.evidence_file_id = f.id AND c.check_name = 'review' ORDER BY c.checked_at DESC LIMIT 1) rv ON true;
