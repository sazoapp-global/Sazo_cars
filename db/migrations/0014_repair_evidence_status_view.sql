-- Repair migration: restore the evidence status view if a database missed it.
-- The view is required by observation and evidence queries.
CREATE OR REPLACE VIEW obs.evidence_status AS
SELECT f.id AS evidence_file_id,
       CASE WHEN rv.outcome = 'rejected' THEN 'rejected'
            WHEN fl.last_flag IS NOT NULL AND (rv.checked_at IS NULL OR rv.checked_at < fl.last_flag) THEN 'needs_checking'
            WHEN rv.outcome = 'cleared' THEN 'cleared'
            ELSE 'ok' END AS status
  FROM obs.evidence_files f
  LEFT JOIN LATERAL (
    SELECT max(c.checked_at) AS last_flag
      FROM obs.evidence_checks c
     WHERE c.evidence_file_id = f.id AND c.outcome = 'flag'
  ) fl ON true
  LEFT JOIN LATERAL (
    SELECT c.outcome, c.checked_at
      FROM obs.evidence_checks c
     WHERE c.evidence_file_id = f.id AND c.check_name = 'review'
     ORDER BY c.checked_at DESC
     LIMIT 1
  ) rv ON true;
