# Pending decisions — defaults the code currently uses

The product owner chose to build while these are still being reviewed. The code follows the **recommended** answer for each, and keeps each one easy to change. To override one, tell the developer (or edit the decisions log) — the "Where it lives in code" column says what changes.

| ID | Recommended default in use | Where it lives in code |
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
| Auth | Not built; signed-in and intake endpoints refuse to run in production | Module 1 (phone OTP, roles, partner client credentials) |
| Summary caching | Computed on read | `report.public_summary_cache` refreshed on `trust.vehicle_updated` |
