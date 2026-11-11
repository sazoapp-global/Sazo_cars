-- Private chats inside a dealer's team (D-177, 11 Nov 2026): any two members of the team (managers and sales
-- staff) may have one chat that only they see. The pair is kept in order (member_a < member_b), so a pair has
-- one chat whoever starts it.

ALTER TABLE dealer.conversations DROP CONSTRAINT conversations_kind_check;
ALTER TABLE dealer.conversations DROP CONSTRAINT conversations_check;
ALTER TABLE dealer.conversations
  ADD COLUMN member_a uuid REFERENCES iam.users(id),
  ADD COLUMN member_b uuid REFERENCES iam.users(id),
  ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('team', 'broker', 'direct')),
  ADD CONSTRAINT conversations_shape_check CHECK (
    (kind = 'team' AND broker_user_id IS NULL AND member_a IS NULL AND member_b IS NULL)
    OR (kind = 'broker' AND broker_user_id IS NOT NULL AND member_a IS NULL AND member_b IS NULL)
    OR (kind = 'direct' AND broker_user_id IS NULL AND member_a IS NOT NULL AND member_b IS NOT NULL AND member_a < member_b));
CREATE UNIQUE INDEX conversations_one_per_pair ON dealer.conversations (organisation_id, member_a, member_b) WHERE kind = 'direct';
