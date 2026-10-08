# SAZO

SAZO brings together scattered information about a vehicle (registry, customs, police, lenders, insurers, garages, auctions, inspectors) and turns it into one trustworthy, plain-language **vehicle story**, so people and businesses in Uganda and East Africa can make better vehicle decisions.

> **MVP status:** the system behaves like production but runs on **simulated data** (decision D-002). All vehicles, plates and people in the seed data are fictional.

## Repository layout

```
apps/
  api/                 NestJS backend — one deployable "modular monolith" (D-080)
packages/
  contracts/           Shared types + validation (Zod): observation types, identifiers, enums
  trust-engine/        Rule Set v1 — turns observations into facts, checks, the 7 buyer questions, scores
  scenarios/           The 26 fictional scenario vehicles + expected outcomes (demo data AND tests)
db/
  migrations/          PostgreSQL schema, one file per change (0001 = Database Schema v0.1)
  tests/               Database smoke tests (run in CI against a real Postgres)
  migrate.mjs          Migration runner
docs/
  design/              Decisions log, domain model, rule set, scenarios, schema, API outline
  api/                 OpenAPI 3.1 spec (sazo-api-v1.yaml)
  PENDING_DECISIONS.md Recommended defaults the code currently uses — override any of them
```

## Quick start (developers)

Requirements: Node 22+, Docker.

```bash
npm install
cp .env.example .env
npm run dev:services      # Postgres 16 + Redis
npm run db:migrate        # apply db/migrations
npm run db:test           # run database smoke tests
npm test                  # unit + scenario tests
npm run lint              # code style + module-boundary rules
npm run dev -w @sazo/api  # start the API on http://localhost:3000/v1
npm run dev -w @sazo/web  # start the website on http://localhost:3001 (talks to the API above)
npm run dev -w @sazo/garage  # start the garage phone app on http://localhost:3002
```

Try it: `curl "http://localhost:3000/v1/vehicles/search?q=UBK%20482M"` · `curl http://localhost:3000/v1/health`

Browser tests: `npm run build -w @sazo/web` then `E2E_DATABASE_URL=<migrated+seeded db> npx playwright test` in `apps/web` (they start the API and website themselves).

End-to-end tests need a migrated database: set `TEST_DATABASE_URL` (CI does this automatically).

## What works so far

| Area | Status |
|---|---|
| Database schema (11 modules, 78 tables) + migration runner + 15 DB tests | ✅ |
| Shared contracts: identifiers (VIN / chassis / plate, typo suggestions), observation catalogue | ✅ |
| Trust engine — Rule Set v1, all 26 scenarios pass as unit tests | ✅ |
| **Full pipeline:** Ingestion → Vehicle Registry (cloned plates, provisional vehicles, reviewer decisions) → Observations → Trust (recompute on events, stored runs, conflicts) → Reports | ✅ |
| API: health, search, public summary, full report, timeline, evidence ledger, partner submissions | ✅ |
| **Sign-in & access (module 1):** phone one-time codes by SMS, rotating refresh tokens (stolen-token detection), roles & permissions, business sign-up with approval (pending businesses cannot submit), audit log | ✅ |
| **Admin APIs:** organisation approval queue, conflict review (resolve/dismiss with reasoning, cloned-plate settlement), ambiguous vehicle matches, data sources (retire/supersede simulated feeds), trust rebuilds | ✅ |
| All 27 scenario vehicles loaded through the real pipeline match their expected outcomes (automated) | ✅ |
| **Garage workspace (module 7):** find the car by plate, job drafts saved step by step (offline-safe ids, version checks), photo uploads checked by hash, consistency warnings that must be explained, submit → the vehicle's history, customer confirms or disputes by SMS link; staff accounts | ✅ |
| Customer details encrypted in the personal-data store; confirmation links single-use and never logged | ✅ |
| **Consumer website (Next.js):** search by plate/VIN/chassis, several-cars and not-found guidance, public summary (no figures), phone-code sign-in, full report (Vehicle Health + Record Confidence with reasons, key facts, 7 questions, price range estimate), timeline, evidence ledger with filters, customer confirmation page for garage SMS links | ✅ |
| Browser tests on a phone-sized screen, with automatic accessibility checks (axe, WCAG 2 AA) | ✅ |
| **Garage phone app (installable, works offline):** sign in by phone, find the car by plate (or carry on without signal), work-type tiles, mileage + odometer photo, details per type of work, customer + consent + cost, check-and-send with explained warnings, job list with customer-confirmation status, staff management. Drafts and photos are kept on the phone and sync when the signal returns | ✅ |
| **Admin console (website `/admin`, SAZO staff only):** overview of what needs a person, business approvals, conflict review (records side by side, resolve/dismiss with reasoning, mark a record as a mistake or duplicate, settle a cloned plate, notes), uncertain vehicle matches, data sources (pause/retire/replace simulated feeds), recalculation | ✅ |
| **Business sign-up (website `/business`):** for-businesses page, registration, approval progress, sending verification documents, SAZO's questions shown to the business, SMS on every decision; reviewers open the documents from the approval queue | ✅ |
| **Partner data-entry console (website `/partner`):** for each data source (registry, customs, police, lender, insurer, auction, rental, manufacturer, dealer, inspection), enter one record with a form built from the record catalogue, or upload a CSV file (template per source; every row checked; good rows sent in batches; re-sending a file never duplicates); recent submissions with per-record results | ✅ |
| **Buyer tools:** save cars (answers update as records arrive), compare 2–3 cars question by question with differences highlighted, share a frozen copy of a report by link (30 days, no sign-in, can be stopped; prints as PDF), add a car SAZO doesn't know (shown as not yet confirmed until an official record matches) | ✅ |
| **My cars (owners, O-007):** "This is my car" on a report — confirmed at once when the phone matches the registry record, otherwise a logbook photo checked by SAZO staff (`/admin/ownership`); owners confirm or dispute garage visits from their time; ownership ends when the car is sold on | ✅ |
| **Inspector workspace (P-004):** inspectors and inspection centres use the same phone app ("SAZO Inspect"): find the car, mileage + odometer photo, chassis/colour/engine as seen, paint thickness per panel, structure, tyres, battery, defects, photos, pass/fail; works offline; differences from the records must be explained; SAZO stores a fingerprinted report file; buyers see a "Latest inspection" card and a repaint note (Rule Set v1.1) | ✅ |
| **Dealer workspace (P-005, website `/dealer/…`):** list cars for sale (known car by plate, or a new one by VIN/chassis), asking price and mileage become dealer listings in the car's history, price changes, record a sale (price kept private), buyer report links, team members | ✅ |
| **Reported problems (O-002):** garages, inspectors and dealers report signs of fraud from the phone app; the car shows a neutral "being checked" notice while a serious report is open; SAZO staff uphold or dismiss at `/admin/concerns`; buyers see only what was upheld | ✅ |
| **Model reviews and creator videos (D-063, P-008):** on each full report, "What owners say about the <model>" — star reviews (first names only; "verified owner" when SAZO has confirmed they own one) and TikTok/YouTube/Instagram videos; everything waits for a moderator at `/admin/moderation` | ✅ |
| Account settings, server-made PDFs, launch preparation | ⏳ next |

### Load the demo vehicles

```bash
npm run db:migrate                 # on an EMPTY database
npm run seed -w @sazo/api          # loads all scenario vehicles through the real pipeline, prints their references
npm run seed:check -w @sazo/api    # verifies every vehicle's verdict against the scenario dataset
```

### Sign in (development)

Outside production, SMS codes are not sent — they are printed in the API log (`(dev) SMS to …`).

```bash
npm run create-admin -w @sazo/api -- --phone +256772000001 --name "Your Name"   # gives a SAZO admin role
curl -X POST localhost:3000/v1/auth/otp/request -H 'content-type: application/json' -d '{"phone":"+256772000001"}'
curl -X POST localhost:3000/v1/auth/otp/verify  -H 'content-type: application/json' -d '{"phone":"+256772000001","code":"<from log>"}'
# then: -H "Authorization: Bearer <accessToken>" on /v1/me, /v1/vehicles/<ref>/report, /v1/admin/...
```

Public without sign-in: health, search, public summary. Everything else needs a token; admin routes need the matching permission.
In production set `JWT_SECRET`, `HMAC_SECRET` (32+ chars each) and `SMS_PROVIDER=africastalking` with `AT_USERNAME`/`AT_API_KEY` — the API refuses to start otherwise.

## Architecture in one paragraph

Every fact enters through **Ingestion** (simulated feeds, partner consoles, the Garage app, later partner APIs) → is matched to a vehicle by the **Vehicle Registry** → stored append-only as an **Observation** with its source and evidence → the **Trust** module recomputes the vehicle (confidence, consistency checks, conflicts, canonical facts, the seven buyer questions) → **Reports** serve exposure-filtered views to each audience. Modules own their own database schema and talk only through interfaces and events. See `docs/design/` for the full design.

## Design documents

| Document | What it defines |
|---|---|
| [Decisions log](docs/design/decisions-log.md) | Every product/system decision (D-xxx decided, P-xxx proposed, O-xxx open) |
| [Domain model](docs/design/domain-model.md) | Entities, rules, module ownership |
| [Rule set v1](docs/design/rule-set-v1.md) | Exact trust rules and thresholds |
| [Scenario dataset](docs/design/scenario-dataset.md) | 26 test vehicles with expected outcomes |
| [Database schema](docs/design/database-schema.md) | Tables, constraints, what the DB enforces |
| [API outline](docs/design/api-outline.md) + [OpenAPI](docs/api/sazo-api-v1.yaml) | Endpoints, module interfaces, events |
