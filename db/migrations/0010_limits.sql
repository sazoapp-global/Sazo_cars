-- 0010 — Indexes for the per-person and per-business limits (security review S5):
-- staff invitations per business per minute, business sign-ups per person per day, share links per person per day.
CREATE INDEX audit_entries_org_action_at ON iam.audit_entries (acting_for_organisation_id, action, at);
CREATE INDEX audit_entries_actor_action_at ON iam.audit_entries (actor_user_id, action, at);
CREATE INDEX shared_links_creator_at ON report.shared_links (created_by_user_id, created_at);
