# SAZO Decisions Log

**Started:** 7 October 2026
**Purpose:** One place for every product and system decision about SAZO. Nothing gets lost between conversations, and nobody has to re-ask a question that has already been answered.

**Status meanings**

| Status | Meaning |
|---|---|
| **DECIDED** | The product owner explicitly agreed. Treat as a requirement. |
| **PROPOSED** | A recommendation waiting for a yes or no. |
| **OPEN** | Not resolved yet. Needs a decision or more information. |
| **FUTURE** | Part of the SAZO vision but not in the MVP unless promoted. |

**Where each decision came from:** **H** = Product & System Handoff v1 · **C** = earlier discovery conversation (ChatGPT) · **S1** = this working session, 7 Oct 2026 · **DZ** = design zip review, 7 Oct 2026

---

## 1. Product and scope

| ID | Status | Decision | Source |
|---|---|---|---|
| D-001 | DECIDED | SAZO is a vehicle-centred **platform** (identity, observations, provenance, trust, intelligence). Products sit on top of it: consumer checks, Garage, business workspaces. The vehicle report is a *view* of the data, not how the data is stored. | C, H |
| D-002 | DECIDED | The MVP behaves like the final system in almost every way. The only difference is that it uses **simulated data**. | S1 |
| D-003 | DECIDED | The MVP is not a throwaway prototype. It is built as modular, production-shaped software. | C, H |
| D-004 | DECIDED | MVP capabilities: vehicle search and identity, history/timeline, maintenance, accidents, mileage integrity, legal and financial information (with controlled exposure), **market valuation, maintenance forecasting, vehicle health score, community/creator reviews**, vehicle comparison, and the **Garage workspace**. | H |
| D-005 | DECIDED | Consumer use is free in the MVP. Payments and subscriptions are future decisions. | C |
| D-006 | DECIDED | The interface designs are concrete requirements. Organisation names, integrations, prices, scores and records shown in them are **illustrative examples**, not confirmed partnerships or data. | C, H |

## 2. Data acquisition and sources

| ID | Status | Decision | Source |
|---|---|---|---|
| D-010 | DECIDED | How data is acquired is kept separate from the SAZO core: **Source → acquisition adapter → validation/normalisation → SAZO core**. Manual entry, simulation, Garage, OCR and partner APIs all produce the same core observations. | C, H |
| D-011 | DECIDED | **Simulated data is a source, not a mode.** Each simulated feed is a labelled source in provenance (e.g. "URA – simulated"). When a real partner connects, that source is switched on and the simulated one is retired. Nothing else changes. | S1 |
| D-012 | DECIDED | Simulated vehicles use **fictional VINs and plates**. Searching a real car returns "Vehicle not found". SAZO never presents invented history about a real vehicle. | S1 |
| D-013 | DECIDED | The simulated data is deliberately realistic: duplicates, mileage conflicts, an engine swap, a cloned-plate case, and missing records. That way the conflict and confidence features can be demonstrated. | S1 |
| D-014 | DECIDED | Two ways SAZO gets data: **integrate existing data** (government, police, URA, banks, insurers, auctions) and **generate new data** (garages and other businesses without digital records). | C |
| D-015 | DECIDED | SAZO holds **two kinds of data**: *vehicle observations* (facts about one specific car) and *reference knowledge* (specifications, service intervals, parts and labour prices, market comparables, model guidance). Reference knowledge has its own sources and its own version history. | S1 |

## 3. Trust, provenance and exposure

| ID | Status | Decision | Source |
|---|---|---|---|
| D-020 | DECIDED | Observations are append-only. A correction is a new record. Nothing is silently overwritten. | C, H |
| D-021 | DECIDED | Event time (when something happened) is stored separately from record time (when SAZO learned about it). | C, H |
| D-022 | DECIDED | Canonical "current" values are derived from observations and can always be recomputed. | C, H |
| D-023 | DECIDED | Conflicts are first-class data. They are recorded, evaluated and resolved, never hidden. | C, H |
| D-024 | DECIDED | Confidence starts rule-based and must explain itself. The breakdown of contributing factors is stored, not just a final number. | C, H |
| D-025 | DECIDED | SAZO separates what it can **acquire, store, derive and expose**. Holding a record does not mean every user can see it. | C, H |
| D-026 | DECIDED | Kinds of evidence are kept distinct and labelled: official/partner records, garage observations, SAZO-derived conclusions, community reviews, creator content. | H |
| D-027 | DECIDED | OCR only assists. It suggests values, a person confirms them, and the original document is kept and linked. | C, H |
| D-028 | DECIDED | Police information in SAZO is limited to **vehicle-related** information, not anyone's general police record. | C, H |

## 4. Vehicle identity

| ID | Status | Decision | Source |
|---|---|---|---|
| D-030 | DECIDED | VIN is the primary consumer search path. Registration plate is also supported. Internally, SAZO keeps several identifiers (VIN, chassis, plate, engine number) under one stable internal SAZO vehicle ID. | C, H |
| D-031 | DECIDED | An engine replacement **does not change the VIN**. The previous engine is kept in the history and the new engine is recorded as a new event. | H |
| D-032 | DECIDED | If a vehicle is not found, SAZO says so clearly and lets the user enter the VIN and related vehicle information. | H |
| D-033 | DECIDED | Approximate vehicle lifecycle: manufacture → import → registration → ownership → servicing → accidents → repairs → sale/transfer → export/scrap. Stages can overlap and some can be unknown. This is not a rigid sequence. | H |

## 5. Consumer experience

| ID | Status | Decision | Source |
|---|---|---|---|
| D-040 | DECIDED | A public summary is available without an account. The fuller report requires signing in. Raw source records are never shown to public users. | C, H |
| D-041 | DECIDED | The **seven buyer questions** are how the report explains a vehicle: identity, care, accidents, mileage, story/provenance, legal/financial, valuation. Maintenance forecasting is attached as "What will I spend after buying?" | H, DZ |
| D-042 | DECIDED | Users can compare vehicles (the designs show up to 3) and save or share a check. | H, DZ |

## 6. Garage

| ID | Status | Decision | Source |
|---|---|---|---|
| D-050 | DECIDED | SAZO Garage is both a useful product for the garage and a SAZO data-acquisition channel. It must give the garage real value. | C, H |
| D-051 | DECIDED | No historical migration. Garage data collection starts when a garage adopts SAZO. | C, H |
| D-052 | DECIDED | Garage capture uses **short, event-specific workflows** (service, repair, engine, body/paint, etc.) and only asks relevant questions, not one generic form. | C |
| D-053 | DECIDED | The garage identifies the vehicle by number plate, which maps to the VIN/vehicle identity. | H |
| D-054 | DECIDED | The garage records type of work, current mileage, cost/payment and evidence. Engine replacement records the old and new engine. Paint work records the area painted and the old and new colour. | H |
| D-055 | DECIDED | **Garages are verified.** A garage cannot record history until SAZO has approved it (business registration, location, contact person). Each garage builds a reliability record that feeds into confidence. | S1 |
| D-056 | DECIDED | **Manager plus named staff accounts.** The manager is the main user and can add mechanics or receptionists. Every record shows who entered it. | S1 |
| D-057 | DECIDED | **Evidence is required for key facts:** an odometer photo for mileage, a plate photo when a garage registers a vehicle new to SAZO, and an engine-number photo for an engine replacement. Routine fields don't need photos. | S1 |
| D-058 | DECIDED | The garage records the **customer's name and phone number**. The owner receives an SMS ("Garage X recorded a service on UAX 123A at 85,000 km. Confirm / Dispute"). A confirmation raises confidence; a dispute raises a flag. Work can still be recorded without a phone number, at lower confidence. *Replaces the handoff's "customer name only."* | S1 |
| D-059 | DECIDED | Automatic consistency checks run on garage records: mileage lower than the last reading, a plate that doesn't match the VIN, an engine number that differs from the record without a declared engine swap. | S1 |

## 7. Intelligence features

| ID | Status | Decision | Source |
|---|---|---|---|
| D-060 | DECIDED | **Valuation:** a price **range** based on comparable vehicles, adjusted for mileage, accident history and condition. It shows how many comparables it used. With few comparables the range is wider and labelled low confidence. Always presented as an estimate. | S1, H |
| D-061 | DECIDED | **Maintenance forecast:** built from a service-interval table per model/engine, a local parts and labour price list, and the vehicle's current mileage and last service per item. Real garage job costs replace the simulated price list over time. | S1 |
| D-062 | DECIDED | **Health score:** rule-based and built from the buyer questions, with each factor's contribution shown. **Missing data must never look like good data.** A vehicle with little history shows "Insufficient history" or a visible coverage warning. | S1, H |
| D-063 | DECIDED | **Community reviews and creator content attach to the model** (make/model/generation, e.g. Toyota Harrier 2014–2017), not to an individual car. Only verified garages and inspectors can add observations about a specific vehicle. | S1 |

## 8. Process

| ID | Status | Decision | Source |
|---|---|---|---|
| D-070 | DECIDED | Analysis continues **screen by screen against the designs**. Questions only come to the product owner where the screens don't answer them, and each comes with a recommended answer. | S1 |
| D-071 | DECIDED | No final database design until the domain model and workflows are settled. The database is derived from them. | C, H |

## 8a. Architecture and technology

| ID | Status | Decision | Source |
|---|---|---|---|
| D-080 | DECIDED | The system must be **easy to grow piece by piece**. It is built as a **modular monolith**: one deployable backend made of self-contained modules that can be split into separate services later if real load demands it. No microservices, Kubernetes or Kafka at MVP. | S1 |
| D-081 | DECIDED | **Module rules:** (1) each module owns its own data in its own PostgreSQL schema, and no other module reads or writes it directly; (2) modules talk only through defined interfaces or events, and events are stored in the database before they are delivered (outbox), so nothing is lost; (3) the app keeps nothing on the server between requests (sessions, files and jobs live in PostgreSQL, Redis or S3), so it can run as many copies as needed. | S1 |
| D-082 | DECIDED | **Language: TypeScript across the whole system** (backend, consumer web, Garage app, consoles). | S1 |
| D-083 | DECIDED | Module plan and build order: 1 Identity & Access · 2 Vehicle Registry · 3 Ingestion · 4 Observations & Evidence · 5 Trust · 6 Reports · 7 Garage · 8 Notifications · 9 Reference & Intelligence · 10 Community · 11 Admin & Partner consoles. The first thin slice is modules 1–6 plus a minimal 7. | S1 |
| D-084 | DECIDED | Database: **PostgreSQL** (managed). | S1 |
| D-085 | DECIDED | Growth path: MVP (2 app containers, 1 background worker, 1 database) → Growth (automatic scaling, read-only database copy, caching) → Scale (split out the module under pressure, dedicated search, a message broker). Each step happens only when measurements show the need. | S1 |

## 9. PROPOSED — now accepted (8 Oct 2026)

| ID | Proposal | Why | Source |
|---|---|---|---|
| P-001 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Two scores, clearly separated: *Vehicle Health*** (what condition the car is in) **and *Record Confidence*** (how complete and well-evidenced its history is). Drop the other score names. | The designs use at least five different score names: Verified History Score, Audit Score, Integrity Score, Condition Score, Confidence Rating. A car can have excellent, fully confirmed records showing it is in poor condition, so one number can't mean both. | DZ |
| P-002 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **The public summary follows the landing-page preview:** one status per area (Identity "Looks correct", Service "8 records found", Accidents "1 record — worth a closer look", Financial "Not available yet") with one plain-language line each. No details, sources or figures. The valuation range and full details need sign-in. | Answers the open question "what does the first result screen show?" The design already handles missing data honestly. | DZ |
| P-003 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Build access control into the system now; make everything free in the MVP.** The "Premium / Unlock" labels in the designs become a setting that can be switched on later. | Keeps the free MVP (D-005) without a rebuild when pricing arrives. | DZ |
| P-004 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Inspection records are in the MVP.** Inspectors and inspection centres can record structured inspections (condition, paint readings, structural checks, tyres, battery, photos), as a simulated source plus a basic inspector workspace. *Booking* an inspector stays future. | Much of the report depends on physical inspection findings (accident panels, wear cross-check, forecast items like tyre tread and battery). Without inspection data, report questions 3, 4 and 7 and the health score would be mostly empty. | DZ |
| P-005 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **MVP business workspaces:** Garage (full), Dealer (vehicle inventory, create and share checks), Inspector (record inspections), partner data-entry consoles for each data domain (police, URA, bank, insurer, auction, rental, manufacturer, inspection centre) to feed simulated data, and SAZO Admin. Lender, insurer, fleet and importer *monitoring* workspaces are future. | The business page shows seven workspace types. Without this split, the MVP grows unchecked. | DZ |
| P-006 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Report wording rules:** SAZO states what the available records show, never guarantees. For example: "No stolen-vehicle report found in available records", not "Free to transfer today". No "warranty", "buyer protection" or "100% cleared" language unless legally backed. | The designs make strong guarantees ("SAZO Inspection Warranty", "INTERPOL cleared", "Proceed with confidence"). These create liability, especially while the data is simulated. | DZ |
| P-007 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **No owner personal details in reports.** Ownership is shown as a number of owners and type of use (private / commercial / rental). No names, occupations or neighbourhoods. | The designs show "Private Doctor, Muyenga" and "owner residing in Nakasero". That conflicts with D-025. | DZ |
| P-008 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Creator links submitted by users go to a moderation queue** before they are published. | The compare screen lets anyone paste a TikTok/YouTube link. | DZ |
| P-009 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Relational database with a modular monolith** (clear internal modules, one deployable system). No microservices or graph database until a real need appears. | Recommended in discovery and not contested; to be confirmed formally at the architecture stage. | C |
| P-010 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Vehicles entered by users through the "not found" flow are provisional.** They get the lowest evidence class and are never shown as verified until another source corroborates them. | Stops people creating fake vehicle histories. | S1 |
| P-012 | **✅ ACCEPTED 7 Oct 2026 ("ok, continue"), treat as DECIDED.** **TypeScript stack details:** NestJS backend · Drizzle ORM · Nx monorepo with enforced module boundaries · BullMQ + Redis for background jobs · REST API with OpenAPI, versioned `/v1`, idempotency keys on data intake · Zod validation shared between frontend and backend · Next.js + Tailwind consumer web · Vite + React installable offline web app (PWA) for Garage · Refine (React) for admin and partner consoles · S3 object storage with write-once settings and file hashes · Africa's Talking for SMS and phone codes · cloud OCR behind a connector · Playwright for PDF rendering and browser tests · Vitest for unit tests · GitHub Actions · Sentry · AWS Cape Town (ECS Fargate, RDS PostgreSQL, ElastiCache, S3, CloudFront). | The concrete choices that follow from D-080–D-084. Each is replaceable without affecting the domain model. | S1 |
| P-013 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **Check data residency** under Uganda's Data Protection and Privacy Act (2019) before real personal data is stored outside Uganda (the AWS Cape Town region is in South Africa). | Legal requirement; affects hosting. | S1 |
| P-011 | **✅ ACCEPTED 8 Oct 2026, treat as DECIDED.** **QR-code vehicle scan, the broker/buyer-agent user type, and co-branded WhatsApp/PDF reports are FUTURE.** Plain PDF download and share links stay in the MVP. | These appear in the designs but extend the scope beyond the agreed MVP. | DZ |

## 10. OPEN — needs a decision or more information

| ID | Question | Notes |
|---|---|---|
| O-001 | **✅ Default accepted 8 Oct 2026: buyers see status only ("Active finance on record"), no lender, amount or case details.** Exact exposure rules for police and finance details (e.g. "has an active lien" vs lender name vs amounts). | Needed for buyer question 6, which is in the MVP. Product/legal decision. |
| O-002 | Garage fraud-report categories and what happens next (admin review, automatic vehicle flag, or both). | |
| O-003 | What makes garages adopt SAZO: voluntary value, regulation, or both. | Business decision. |
| O-004 | Which partners to approach first, and in what order. | |
| O-005 | Business model and monetisation. | Outside the MVP definition. |
| O-006 | Detailed contents for the dealer, auction, rental, manufacturer and inspection-centre domains. | The handoff gives the scope. Field-level detail will come out of the screen walkthrough. |
| O-007 | **✅ DECIDED 8 Oct 2026: matching a phone number and uploading a logbook photo.** If the person's signed-in phone equals the phone on the latest registry owner record, they are confirmed at once; otherwise they send a photo of the logbook and a SAZO reviewer approves or rejects it (with a reason, sent by SMS). Ownership ends automatically when a later change of owner is recorded. | Built as "My cars": confirmed owners confirm or dispute garage visits made while the car was theirs. |
| O-008 | Real-world sources for reference knowledge (comparables, service intervals, price lists) once simulation ends. | |
| O-009 | **Screens not yet designed** (see section 12). | The design zip covers only part of the system. |

## 11. FUTURE (not MVP)

Physical inspection booking and inspector escort · telematics · fleet management · advanced AI/ML fraud and risk models · proactive alerts and live registry notifications · lender/insurer monitoring and underwriting engines · full enterprise API ecosystem and partner self-service · real-time registry sync · regional (East Africa) integrations · richer community and social features · monetisation (report pricing, subscriptions, advertising, lead generation) · advanced valuation and resale intelligence · knowledge-graph infrastructure · QR vehicle scan, broker persona, co-branded reports (pending P-011).

## 12. Design coverage

**Screens received (design zip, 7 Oct 2026):** landing / car check · sign-in / create account · consumer onboarding · full car check report (7 questions) · buyer summary modal · compare cars + reviews · for businesses · design system (DESIGN.md).

**Screens still needed for the MVP:**
- Vehicle-not-found and "add vehicle details" flow
- Consumer dashboard: saved checks, "my car" tracking, vehicle timeline view
- Evidence ledger ("Explore Full Evidence Ledger")
- Garage workspace: onboarding/verification, vehicle lookup, job recording by event type, evidence capture, customer and owner confirmation, garage records, staff management, fraud report
- Dealer workspace: inventory, create and share a check
- Inspector workspace: record an inspection
- Partner data-entry consoles (one pattern, configured per domain)
- SAZO Admin: organisation/garage approval, users, conflicts review queue, moderation, simulated-source management
- Owner SMS confirm/dispute landing page
- Account settings and notifications

---

## Change history

| Date | Change |
|---|---|
| 2026-10-07 | Log created. Brought in decisions from the handoff and earlier discovery. Added S1 decisions (D-002, D-011–D-015, D-055–D-063, D-070). D-058 replaces the handoff's "customer name only" rule. Design zip reviewed; P-001–P-011 and section 12 added. |
| 2026-10-07 | Architecture decided: modular monolith, module rules, TypeScript, PostgreSQL, module build order, growth path (D-080–D-085). Stack details (P-012) and a data-residency check (P-013) proposed. |
| 2026-10-07 | P-012 accepted. Domain Model v0.1 written (separate project doc `SAZO Domain Model.md`); it proposes DM-1 to DM-8 for confirmation. |
| 2026-10-07 | Scenario Dataset v0.1 written (26 scenarios + 5 system scenarios with expected outcomes). It found 9 model gaps (G1–G9), fixed in Domain Model v0.2. Temporary rule assumptions R1–R11 are to be formalised in Rule Set v1. |
| 2026-10-07 | Rule Set v1 (`rs-2026.10-v1`) written: reputation, observation confidence, checks C1–C10, conflicts, canonical facts, the seven question rules, record confidence, Health v1, valuation and forecast v1, tunable parameters. All 26 scenario outcomes checked; 3 scenario corrections applied (S14, S15, S18). |
| 2026-10-07 | Database Schema v0.1 written and tested on PostgreSQL 16 (11 module schemas, 78 tables, 15/15 smoke tests pass using scenario data). It proposes DM-9 to DM-16 (e.g. no cross-module foreign keys, append-only enforced by triggers, trust output stored per derivation run). |
| 2026-10-07 | API Outline v0.1: OpenAPI 3.1 spec with 53 operations, validated by Redocly (0 errors, 0 warnings), plus browsable HTML docs, internal module interfaces, event contracts, and the first build slice with its definition of done. |
| 2026-10-08 | Product owner approved all choices in `docs/PENDING_DECISIONS.md`: P-001–P-013 accepted, O-001 default (status-only for finance/police) accepted, DM-1–DM-16 accepted, plus the sign-in and Garage behaviour choices. |
