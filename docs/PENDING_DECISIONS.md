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
- **Admin console:** P-012 proposed Refine for the admin and partner consoles. The admin console is instead built as pages inside the website (`/admin`), reusing its sign-in, design system and tests, with no extra framework. If the consoles grow into heavy data tables later, Refine can still be added for them.

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

## Behaviour choices made while building the consumer website (easy to change)

| Topic | What the code does |
|---|---|
| Wording | Every sentence on a report comes from one catalogue (`packages/contracts/src/copy.ts`). A test checks that every answer the engine can give has wording, that the public summary has no figures, and that no guarantee words appear. |
| Price estimate | Shown only to signed-in people: the middle half of comparable sale prices (25th–75th percentile) and the typical (median) price, rounded to UGX 100,000, labelled as an estimate with its number of sales. |
| Mileage in key facts | Labelled "Mileage (best estimate)" — after a wind-back it is the highest trustworthy figure, not the latest reading. |
| Price question status | Reads "Estimate available" / "Rough estimate" instead of "Consistent". |
| Sign-in on the website | Phone code only; tokens live in httpOnly cookies, never in browser JavaScript. Sessions refresh automatically; two refreshes from the same browser within 10 seconds are treated as one, not as a stolen token. |
| Fonts and icons | Bundled with the site (no Google requests): lighter on mobile data and nothing leaks to third parties. |
| Simulated data notice | A strip at the top of every page while all records are simulated. |

## Behaviour choices made while building the garage phone app (easy to change)

| Topic | What the code does |
|---|---|
| Offline | Everything typed and every photo is saved on the phone immediately. Drafts sync to SAZO in the background whenever there is signal; **sending** a job needs signal. |
| Finding the car with no signal | The mechanic can carry on with just the plate; SAZO matches it when the job is sent. |
| Two phones editing one draft | The phone that last saved wins (it holds the newest answers). A draft started on another phone shows as read-only. |
| Customer details on the phone | Kept on the phone only until the job is sent, then deleted from the phone. Signing out wipes everything stored on the phone. |
| Staying signed in | The refresh token is stored on the phone so mechanics stay signed in between days; the access token is only in memory. |
| Photos | Shrunk to at most 1600 px (JPEG) to save data, then fingerprinted before upload. |
| Deployment | The app and the API are served from the same web address (the app calls `/v1`), so no cross-site access is needed. |
| App updates | A new version is offered with an “Update” button; it never reloads in the middle of a job. |

## Behaviour choices made while building business sign-up (easy to change)

| Topic | What the code does |
|---|---|
| Who can register | Any signed-in person; they become the business's manager. Garages get the Garage app; dealers, inspectors and inspection centres can register now and get their workspaces later. |
| Documents | Trading licence or URSB certificate and a photo of the premises — photos or PDFs, up to 8 MB each. Only the business's managers and SAZO reviewers can open them. |
| SAZO asks for more | The reviewer's question is shown to the business and sent by SMS. Sending more documents puts the business back in the review queue. |
| Decision SMS | Managers get an SMS for approve, reject, more-information and suspend. A rejection SMS does not include the reviewer's reason (it says to contact support). |
| Photos in buyer views | Buyers see that a photo exists, never the photo itself (it may show people or places). Only the uploader and SAZO reviewers can open it. |

## Behaviour choices made while building the partner data-entry console (easy to change)

| Topic | What the code does |
|---|---|
| What each source may send | Fixed per kind of source in `packages/contracts/src/partner.ts` (e.g. police: stolen, recovered, impounded, released, accident; lenders: finance registered / paid off). The API refuses anything else from people sending records; internal test-data loads are not limited. |
| Who can send | Operators of the organisation that owns the source, and SAZO admins (for the simulated sources during testing). Garages use the Garage app, not this console. |
| Mileage in miles | The partner types the reading and the unit; SAZO works out km. |
| Dates | One date per record (the day it happened); a date in the future is refused. |
| CSV files | Up to 5,000 rows and 5 MB. Every row is checked first; only good rows are sent; each row gets its own result. Sending the same file again returns the same submission instead of duplicating records. Lists inside a cell use `;`. |
| Finance details | Lender names and amounts are not entered here (O-001: buyers see status only). |

## Behaviour choices made while building the buyer tools (easy to change)

| Topic | What the code does |
|---|---|
| Saved cars | Up to 200 per person. The list shows today's answers, so a saved car's status can change when new records arrive. |
| Compare | 2 or 3 cars, signed in. Rows where the cars differ are highlighted. Only records — no reviews or opinions (D-063). |
| Share links | A copy of the report frozen at that moment, valid 30 days, opened without signing in, can be stopped at any time. Same content a signed-in buyer sees: no owner details, no garage costs, finance status only. |
| PDF | For now the shared report prints cleanly to PDF from the phone or computer ("Save as PDF"). A PDF made by the server comes later. |
| Adding an unknown car | Signed-in people can add up to 5 cars a day. If the plate, VIN or chassis is already known, they are sent to that car instead. The car stays "not yet confirmed" — even with a VIN — until an official record matches it; then it is confirmed automatically. Make and model typed by the person are not shown as facts (too weak a source) until a trusted record confirms them. |
| “My cars” | Not built yet: it depends on O-007 (how an owner proves ownership). |
