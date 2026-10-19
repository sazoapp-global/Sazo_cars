-- 0015 Dealership system, step 2: selling (D-125). Share links for WhatsApp, TikTok and Facebook that open a
-- public car page with the car's SAZO summary; enquiries from that page or added by staff; and the sale
-- stages from enquiry to completed. Customers belong to the dealer: their name and phone live in the
-- encrypted personal-data store (pii.parties) and only the dealer's staff can see them (P-007).

CREATE TABLE dealer.car_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash          bytea NOT NULL UNIQUE,               -- sha256 of the random token; the token itself is never stored
  organisation_id     uuid NOT NULL,
  stock_item_id       uuid NOT NULL REFERENCES dealer.stock_items(id),
  channel             text NOT NULL CHECK (channel IN ('whatsapp','tiktok','facebook','instagram','other')),
  broker_user_id      uuid,                                -- set for a broker's own link (step 3)
  show_dealer_name    boolean NOT NULL DEFAULT true,
  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);
CREATE INDEX ON dealer.car_links (stock_item_id) WHERE revoked_at IS NULL;
CREATE INDEX ON dealer.car_links (organisation_id, created_at);

CREATE TABLE dealer.leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  stock_item_id       uuid REFERENCES dealer.stock_items(id),
  party_id            uuid NOT NULL,                       -- pii.parties: the customer's name and phone, as given to this dealer
  phone_hash          bytea NOT NULL,                      -- for duplicate checks within this dealer, without decrypting
  source              text NOT NULL CHECK (source IN ('whatsapp','tiktok','facebook','instagram','broker','walk_in','phone_call','other')),
  car_link_id         uuid REFERENCES dealer.car_links(id),
  broker_user_id      uuid,
  stage               text NOT NULL DEFAULT 'enquiry' CHECK (stage IN ('enquiry','viewing','negotiation','deposit','handover','completed','lost')),
  consent_to_contact  boolean NOT NULL,
  message             text,
  sale_price_ugx      bigint CHECK (sale_price_ugx > 0),
  created_by_user_id  uuid,                                -- null when the customer sent it from a car page
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  CHECK (stage <> 'completed' OR (sale_price_ugx IS NOT NULL AND closed_at IS NOT NULL))
);
CREATE INDEX ON dealer.leads (organisation_id, stage, created_at DESC);
CREATE INDEX ON dealer.leads (organisation_id, phone_hash);
CREATE TRIGGER trg_touch BEFORE UPDATE ON dealer.leads FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- What happened to each enquiry, in order (append-only).
CREATE TABLE dealer.lead_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  lead_id          uuid NOT NULL REFERENCES dealer.leads(id),
  kind             text NOT NULL CHECK (kind IN ('created','stage','note')),
  from_stage       text,
  to_stage         text,
  note             text,
  actor_user_id    uuid,
  at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON dealer.lead_events (lead_id, at);
SELECT platform.append_only('dealer.lead_events');

-- The number customers reach on WhatsApp from a car page (optional).
ALTER TABLE dealer.settings ADD COLUMN whatsapp_e164 text CHECK (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- A customer agreeing that a dealer may contact them about a car.
ALTER TABLE pii.party_consents DROP CONSTRAINT party_consents_purpose_check;
ALTER TABLE pii.party_consents ADD CONSTRAINT party_consents_purpose_check CHECK (purpose IN ('attestation_sms','service_reminders','marketing','dealer_contact'));
