# Decisions in the code — approved

**✅ Approved by the product owner on 8 Oct 2026** ("I approve the choices in docs/PENDING_DECISIONS.md"). Everything in this file — the recommended defaults below, the behaviour choices for sign-in and the Garage workspace, and the engineering notes — is now the agreed behaviour. P-001…P-013, the O-001 default and DM-1…DM-16 are recorded as DECIDED in the [decisions log](design/decisions-log.md). Each stays easy to change: the "Where it lives in code" column says what changes. The engineering notes remain a to-do list of simplifications to replace before launch.

| ID | Decision in use | Where it lives in code |
|---|---|---|
| P-001 | Two scores only: Vehicle Health + Record Confidence | `packages/trust-engine` (`health.ts`, `record-confidence.ts`) |
| P-002 | Public summary = one status + one line per question; details/valuation need sign-in | Reports module, exposure policies |
| P-003 | Access control built; everything free in MVP | `iam` permissions; no paywall code |
| P-004 | Inspection records in MVP (booking = future) | Observation type `inspection_result`; inspector source |
| P-005 | MVP workspaces: Garage, Dealer (basic), Inspector, partner consoles, Admin | Module list |
| P-006 | Wording states what records show, never guarantees | Headline keys + template file; banned-phrase test |
| P-007 | No owner personal details in reports | `pii` schema; exposure policies |
| P-008 | Creator links moderated before publishing | `community` module |
| P-009 | Relational DB, modular monolith | Architecture |
| P-010 | Owner-entered vehicles stay "not yet verified" | Registry `provisional` status |
| P-011 | QR scan, broker persona, co-branded WhatsApp reports = future | Not built |
| P-013 | Host on AWS Cape Town with simulated data; legal check before real personal data | Deployment config (not yet built) |
| O-001 | Buyers see **status only** for finance/police ("Active finance on record"), no lender/amount/case details | `report.exposure_policies` rows — change data, not code |
| DM-1…DM-16 | All as recommended in the Domain Model and Database Schema documents | Schema + modules |

## Small engineering deviation to note

- **Monorepo tooling:** the design proposed Nx (P-012). To keep the first build simple, the repo uses plain **npm workspaces** and enforces module boundaries with **dependency-cruiser** (`npm run lint:boundaries`). Nx can be added later without restructuring. Everything else in P-012 (NestJS, Drizzle, Zod, BullMQ, Next.js, PWA, etc.) is unchanged.

## Engineering notes (temporary simplifications, to revisit)

| Area | Current | Later |
|---|---|---|
| Events | Transactional outbox per module + in-process delivery after commit | Background worker (BullMQ) retries unpublished outbox rows |
| Recompute after a dispute | Recomputes the disputed vehicle only | Also refresh other vehicles of that garage (reputation change), e.g. nightly rebuild |
| Queries | Plain SQL through the `pg` driver (Drizzle instance wired, typed schema not generated yet) | `drizzle-kit pull` to generate typed tables |
| Auth | Phone OTP + JWT (15 min) + rotating refresh tokens (30 days). Partners submit as signed-in users acting for their organisation | Partner machine credentials (OAuth2 client credentials); password sign-in (returns 501 for now) |
| SMS | Africa's Talking adapter (unverified against a live account) + console sender for dev/tests | Confirm sender ID and pricing; add delivery-report webhook |
| Rebuilds | `POST /admin/rebuilds` and source changes recompute in-process, synchronously | Run as a BullMQ job with progress |
| Admin lists | Simple `limit`, no cursor yet (`nextCursor: null`) | Cursor pagination when queues grow |
| Evidence storage | Local folder, write-once files; upload URL points at the API | S3 with Object Lock + pre-signed URLs (same client flow) |
| Personal-data encryption | AES-256-GCM with one app key (`PII_ENCRYPTION_KEY`) | Cloud KMS envelope keys, per-party keys for crypto-shredding |
| Receipt reading (OCR, D-027) | Returns 501 | Build with the garage app |
| Suspicious-activity reports | Not built (categories still open, O-002) | After O-002 is decided |
| Summary caching | Computed on read | `report.public_summary_cache` refreshed on `trust.vehicle_updated` |

## Behaviour choices made while building module 1 (easy to change)

| Topic | What the code does |
|---|---|
| First sign-in | Creates a **consumer** account; a display name is required. A correct code stays usable if the name was missing, so the user can retry. |
| Stolen refresh token | Presenting an already-used refresh token revokes the whole session (both copies stop working). |
| Pending business (X4) | Members of an organisation that is not yet approved get `403 organisation_not_approved` on submissions. |
| Other organisations' submissions | Look exactly like missing ones (404), so nobody can discover them. |
| Cloned plate settled by a reviewer | The genuine vehicle keeps the plate; the clone's copy becomes *historical (correction)* and no longer appears in search. Nothing is deleted. |
| Retiring a simulated source (X1) | Its records are excluded only when it is retired **and** superseded by a real source (D-011); retiring alone just stops new intake. |
| Resolve / dismiss / reopen a conflict | Needs `conflict.resolve` (reviewers and admins); resolving needs an interpretation and reasoning. Every decision is audited. |

## Behaviour choices made while building the Garage workspace (easy to change)

| Topic | What the code does |
|---|---|
| Mileage on every job | Every job needs the dashboard mileage and an odometer photo (D-054, D-057), whatever the work type. |
| Warnings (D-059) | Mileage lower than last time, an implausible yearly distance, an old engine number that differs from the record, or a plate on several vehicles come back as warnings. The mechanic must write a short explanation to continue; the explanation is kept with the job. Only a date in the future blocks. |
| New staff | Active straight away (the manager vouches); they get an SMS and sign in with their phone. |
| Car new to SAZO | Needs a plate photo; becomes a *provisional* vehicle until an official record confirms it (P-010). |
| Customer SMS | Sent only with a phone number **and** the customer's consent ticked by the garage. Without a phone the job is still recorded (lower confidence, D-058). |
| Who answers the SMS | Recorded as the *customer* (who brought the car), not the registered owner — a smaller confidence effect (Rule Set §2). |
| Confirmation link | Single-use, valid 14 days; only its hash is stored; the link is redacted in the message log. |
| What the confirmation page shows | Garage name, date, plate, type of work, mileage. No cost, no names. |
| Garage's data source | Created automatically on the first submitted job (channel `garage_app`, starting reputation 0.70). |
| Cost | Stored as a confidential record: never shown to consumers (P-007). |
