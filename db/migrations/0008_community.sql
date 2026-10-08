-- 0008 — Community (D-063, P-008): reviews and creator videos attach to a car MODEL, never to one car.
-- Everything people post waits for a SAZO moderator before it is published.

-- One review per person and model (they can be replaced after removal or rejection).
CREATE UNIQUE INDEX model_reviews_one_live ON community.model_reviews (model_id, author_user_id) WHERE status IN ('pending','published');
CREATE INDEX ON community.model_reviews (model_id, status, created_at DESC);
CREATE INDEX ON community.creator_links (model_id, status);
ALTER TABLE community.model_reviews ADD CONSTRAINT model_reviews_body_length CHECK (length(body) BETWEEN 30 AND 2000);
ALTER TABLE community.model_reviews ALTER COLUMN rating SET NOT NULL;
-- One moderation case per item; cases are how moderators see the queue.
CREATE UNIQUE INDEX moderation_cases_one_per_target ON community.moderation_cases (target_type, target_id);
CREATE INDEX ON community.moderation_cases (status, created_at);

INSERT INTO iam.permissions (code, description) VALUES
  ('community.contribute', 'Write model reviews and suggest creator videos')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'community.contribute' FROM iam.roles r WHERE r.code IN ('consumer', 'sazo_admin')
ON CONFLICT DO NOTHING;
