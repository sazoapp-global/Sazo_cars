-- Messages in the dealer system (D-173, 11 Nov 2026): a dealer's team (managers and sales staff) talk among
-- themselves, and with each broker who shares their cars. One conversation per dealer for the team, and one
-- per dealer and broker; every member of the dealer's team sees the dealer's side of both.
-- A message is text, and may carry one of the dealer's cars as a card.

CREATE TABLE dealer.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES iam.organisations(id),
  kind             text NOT NULL CHECK (kind IN ('team', 'broker')),
  broker_user_id   uuid REFERENCES iam.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'team') = (broker_user_id IS NULL))
);
CREATE UNIQUE INDEX conversations_one_team ON dealer.conversations (organisation_id) WHERE kind = 'team';
CREATE UNIQUE INDEX conversations_one_per_broker ON dealer.conversations (organisation_id, broker_user_id) WHERE kind = 'broker';
CREATE INDEX conversations_by_broker ON dealer.conversations (broker_user_id, last_message_at DESC) WHERE kind = 'broker';
CREATE INDEX conversations_by_dealer ON dealer.conversations (organisation_id, last_message_at DESC);

CREATE TABLE dealer.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES dealer.conversations(id),
  sender_user_id   uuid NOT NULL REFERENCES iam.users(id),
  body             text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  stock_item_id    uuid REFERENCES dealer.stock_items(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_in_conversation ON dealer.messages (conversation_id, created_at DESC);

-- How far each person has read in each conversation: unread counts and "Seen".
CREATE TABLE dealer.conversation_reads (
  conversation_id  uuid NOT NULL REFERENCES dealer.conversations(id),
  user_id          uuid NOT NULL REFERENCES iam.users(id),
  last_read_at     timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
