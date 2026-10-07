# SAZO API Outline v0.1

**Status:** Draft for review · **Date:** 7 October 2026
**Files:** `sazo-api-v1.yaml` (OpenAPI 3.1, validated with Redocly: 0 errors, 0 warnings) · `sazo-api-v1-docs.html` (browsable reference)
**Built on:** Domain Model v0.2 · Database Schema v0.1 · Rule Set v1 · Decisions Log

This document covers two layers:
1. **The public HTTP API** (`/v1`): what the website, Garage app, partner consoles, partner systems and admin consoles call. The full detail is in the OpenAPI file; the sections below give the map and the rules.
2. **Internal module interfaces and events**: how the 11 modules inside the backend talk to each other (D-081).

---

## 1. Public API: the map (53 operations)

| Area | Endpoints | Who calls it |
|---|---|---|
| **Auth** (6) | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/password/sign-in`, `/auth/refresh`, `/auth/sign-out`, `GET /me` | Everyone |
| **Vehicles** (7) | `GET /vehicles/search?q=`, `GET /vehicles/{ref}/summary` (public), `/report`, `/timeline`, `/evidence`, `GET /vehicles/compare?refs=`, `POST /vehicles/provisional` | Consumer website |
| **Saved & shared** (6) | saved checks (list/save/remove), `POST /vehicles/{ref}/snapshots`, `GET /snapshots/{ref}/pdf`, `GET /shared/{token}` | Consumer website |
| **Garage** (8) | `GET /garage/vehicles/lookup?plate=`, jobs (list, `PUT` draft upsert, get, `POST …/submit`), staff (list, invite), `POST /garage/suspicious-activity` | Garage app |
| **Evidence** (4) | `POST /evidence/uploads` (pre-signed URL), `/evidence/{id}/complete`, `/evidence/{id}/ocr`, `/ocr/{id}/confirm` | Garage app, inspector, partner consoles |
| **Ingestion** (2) | `POST /ingest/submissions`, `GET /ingest/submissions/{id}` | Partner consoles, simulated feeds, partner systems later |
| **Attestation** (4) | `POST /webhooks/sms/inbound`, `/webhooks/sms/delivery`, `GET`/`POST /attest/{token}` | SMS provider, owners |
| **Admin** (15) | organisations + decision, conflicts (list, detail, actions), identity resolutions (list, decide), vehicle merges (merge, reverse), sources (list, update), rule-set activate, rebuilds, moderation (list, decide) | SAZO staff console |
| **System** (1) | `GET /health` | Monitoring |

## 2. API rules every endpoint follows

| Rule | Detail | From |
|---|---|---|
| **Versioned** | Everything under `/v1`. Additions are allowed within a version; breaking changes become `/v2` | — |
| **Vehicles by public reference** | `SZV-7K3M-9Q2D`, never internal UUIDs | DM-8 |
| **Idempotency** | Every create or submit carries an `Idempotency-Key`. A replay returns the original result; the same key with a different body → 409 | X5 |
| **Exposure on the server** | Responses are filtered for the caller's audience before they leave the server. Hidden fields are *absent*, not just greyed out | D-025, P-007 |
| **Text as keys** | User-facing wording comes back as `headlineKey` + `params`, e.g. `mileage.serious.decrease {earlier: 121000, later: 88400}`. The apps render it from one template file that follows the wording rules | P-006 |
| **Errors** | RFC 9457 `problem+json` with a stable `code`, e.g. `evidence_required`, `organisation_not_approved`, `idempotency_key_reused` | — |
| **Warn, don't block** | Garage consistency problems come back as `warnings`. The user can continue with an explanation (`acknowledgedWarnings`) | D-059 |
| **Search honesty** | Several matches → `multiple` (never pick one); typos → `suggestion`; a server error is never shown as "not found" | Identity rule 4, G9 |
| **Organisation context** | Business calls send `X-Organisation-Id`; the server checks an active membership and that the organisation is approved | D-055, D-056 |
| **Asynchronous intake** | Submissions return `202` and are processed in the background; the status is available at `GET /ingest/submissions/{id}` | — |
| **Rate limits** | Anonymous search and summary are limited per client (anti-scraping); `429` with `Retry-After` | — |
| **Simulated-data notice** | Search results carry `simulatedDataNotice: true` while records come from simulated sources | D-011 |

## 3. Authentication and access

| Caller | How it authenticates | Notes |
|---|---|---|
| Consumers and business users | Phone one-time code (Africa's Talking SMS) or password → short-lived access token (15 min) + rotating refresh token | The token carries user id, platform roles and memberships |
| Partner systems (Stage 1, later) | OAuth2 client credentials, scoped to their own source (`submission.create:<domain>`) | Defined now so the contract is stable |
| SMS provider callbacks | Signed with a shared secret | Phone numbers are hashed on arrival |
| Owners confirming a garage visit | A single-use link token from the SMS (no account needed) | Expires; can't be reused |

**Permission examples** (the full list is seeded into `iam.permissions`):
`vehicle.summary.read` (public) · `vehicle.report.full.read` (consumer) · `garage.job.create` / `.submit` (org_staff) · `garage.staff.manage` (org_manager) · `submission.create:<domain>` (partner_operator) · `conflict.resolve`, `organisation.approve`, `vehicle.merge`, `source.manage`, `ruleset.activate` (sazo_admin / sazo_reviewer).

## 4. Key flows end to end

**A. Buyer checks a car**
1. `GET /vehicles/search?q=UBK 482M`
2. The result is `found`. The app calls `GET /vehicles/SZV-…/summary`, which shows the seven statuses (public).
3. The buyer signs in (OTP request, then verify).
4. `GET /vehicles/SZV-…/report`, `/timeline`, `/evidence` (filtered for the consumer audience).
5. Optional: save the check, or create a snapshot and share it as a PDF or link.

**B. Garage records an engine replacement (S06)**
1. `GET /garage/vehicles/lookup?plate=UBK482M` returns the car with its last mileage and expected engine number.
2. The phone creates a job ID and repeatedly calls `PUT /garage/jobs/{id}` as a draft. This works offline and syncs later.
3. Each photo goes through `POST /evidence/uploads`, then a PUT to S3, then `POST /evidence/{id}/complete`. Optionally `/ocr` reads the receipt, and `/ocr/{id}/confirm` confirms the values.
4. `POST /garage/jobs/{id}/submit` (Idempotency-Key) → `202`, with any warnings.
5. In the background:
   - The submission becomes observations.
   - Trust recalculates the vehicle.
   - An owner SMS is sent.
   - The owner replies "1" (the inbound webhook) or opens `/attest/{token}`.
   - The attestation is recorded, and Trust recalculates again.

**C. Partner operator enters police data (simulated)**
1. `POST /ingest/submissions` with `X-Source-Code: POL-SIM`.
2. → `202`.
3. `GET /ingest/submissions/{id}` shows the per-item results: matched / ambiguous / rejected. Ambiguous items go to the admin queue.

**D. Reviewer handles a cloned plate (S08)**
1. `GET /admin/conflicts?status=open&topic=identity`.
2. `GET /admin/conflicts/{id}` shows both vehicles' observations side by side.
3. `POST /admin/conflicts/{id}/actions` with `{action: resolve, interpretation, reasoning, relations:[retracts…]}`.
4. Trust recalculates both vehicles.

**E. Switching simulated URA to the real feed (X1)**
1. `PATCH /admin/sources/{simulatedId}` with `{status: retired, supersededBySourceId}`.
2. `POST /admin/rebuilds` → reports change. No code change.

---

## 5. Internal module interfaces

Inside the backend, modules talk only through these interfaces (synchronous, in-process) or through events (asynchronous, via each module's outbox). This is what Nx's module-boundary lint rule enforces. The interfaces are written in TypeScript; the shapes are abbreviated here.

```ts
// 1 Identity & Access
interface IdentityAccess {
  getActor(token: string): Actor;                                   // user + roles + memberships
  assertCan(actor: Actor, permission: string, orgId?: string): void;
  getOrganisation(orgId: string): OrganisationSummary;              // incl. status (approved?)
}

// 2 Vehicle Registry
interface VehicleRegistry {
  resolve(identifiers: PresentedIdentifiers, ctx: { submissionItemId: string; eventTime?: Date })
    : ResolutionResult;                                             // matched | created_new | provisional | ambiguous | rejected
  search(query: string): SearchOutcome;                             // found | multiple | not_found | invalid (+ suggestion)
  getVehicle(ref: string): VehicleIdentity;                         // follows merges
  listIdentifiers(vehicleId: string): Identifier[];
  merge(fromId: string, intoId: string, reason: string, by: string): Merge;
  reverseMerge(mergeId: string, reason: string, by: string): Merge;
}

// 3 Ingestion
interface Ingestion {
  submit(sourceCode: string, envelope: SubmissionInput, actor: Actor, idempotencyKey: string): SubmissionAccepted;
  getSubmission(id: string, actor: Actor): Submission;
  getSourceCoverage(sourceId: string): Coverage[];                  // used by Trust (G2)
  listSources(): Source[];
}

// 4 Observations & Evidence
interface Observations {
  recordFromSubmission(item: AcceptedItem): { eventId?: string; observationIds: string[] };  // Ingestion only
  addRelation(rel: RelationInput, actor: Actor): void;              // corrects | retracts | duplicates
  listForVehicle(vehicleIds: string[], opts?: { asOf?: Date }): Observation[];             // Trust reads this
  listAttestations(vehicleIds: string[]): Attestation[];
  requestAttestation(eventId: string, partyId: string): void;
  recordAttestation(input: AttestationInput): void;                 // from SMS reply or link
  evidence: { startUpload(...): UploadSlot; complete(id: string): EvidenceFile; signedThumbUrl(id: string): string };
  parties: { upsertByPhone(phone: string, name?: string): string /* partyId */; erase(partyId: string): void };
}

// 5 Trust
interface Trust {
  recompute(vehicleId: string, trigger: Trigger, asOf?: Date): RunId;    // normally via events, not called directly
  getCurrent(vehicleId: string): TrustSnapshot;                          // facts, questions, record confidence, open conflicts
  getObservationAssessments(vehicleId: string): Assessment[];
  conflicts: { list(filter): Conflict[]; get(id): ConflictDetail; act(id, action, actor): Conflict };
  activateRuleSet(version: string, actor: Actor): void;
}

// 6 Reports
interface Reports {
  publicSummary(vehicleRef: string): PublicSummary;
  fullReport(vehicleRef: string, audience: Audience): FullReport;   // applies exposure policies
  timeline(vehicleRef: string, audience: Audience, page): Page<TimelineEvent>;
  evidenceLedger(vehicleRef: string, audience: Audience, filter, page): Page<ObservationView>;
  snapshot(vehicleRef: string, actor: Actor): Snapshot;
}

// 7 Garage
interface Garage {
  lookup(plate: string, actor: Actor, orgId: string): GarageLookupResult;
  upsertDraft(jobId: string, input: GarageJobDraftInput, actor: Actor, orgId: string): GarageJob;
  submit(jobId: string, ack: AckWarning[], actor: Actor, orgId: string, key: string): GarageSubmitResult;
}

// 8 Notifications
interface Notifications {
  send(msg: { channel: 'sms'; toPartyId?: string; toUserId?: string; template: string; params: object; purpose: string }): string;
  handleInbound(raw: ProviderPayload): void;                        // → AttestationReceived via Observations
}

// 9 Reference & Intelligence
interface Intelligence {
  getHealth(vehicleId: string): VehicleHealth;
  getValuation(vehicleId: string): Valuation;
  getForecast(vehicleId: string): Forecast;
  modelFor(chassisOrSpec: string): VehicleModel | null;
}
```

**Read paths vs write paths**
- **Writes** always flow one way: `Garage / Ingestion → Vehicle Registry (resolve) → Observations → (event) → Trust → (event) → Intelligence, Reports`.
- **Reads** for screens go through **Reports**, which calls Trust, Observations and Intelligence. Nothing else assembles a report, so exposure filtering happens in exactly one place.

## 6. Events (outbox contracts)

Every event carries `{ eventId, type, occurredAt, aggregateId, version, payload }`. Consumers must be **idempotent**: an event can be delivered twice, and handlers check `eventId`.

| Event | Payload (main fields) | Publisher → consumers |
|---|---|---|
| `organisation.approved` / `.suspended` | orgId, type | IAM → Ingestion (enable/disable sources), Trust (reputation cap) |
| `submission.accepted` | submissionId, sourceId, itemIds | Ingestion → Observations |
| `vehicle.created` / `.merged` / `.merge_reversed` / `.split` | vehicleIds, mergeId | Registry → Trust, Reports |
| `observation.recorded` | vehicleId, observationIds, eventId | Observations → Trust, Intelligence |
| `observation.related` | kind, fromId, toId, vehicleId | Observations → Trust |
| `attestation.requested` | eventId, partyId, channel | Observations → Notifications |
| `attestation.received` | eventId, response, attesterKind, sourceId | Observations → Trust (observation + garage reputation) |
| `trust.vehicle_updated` | vehicleId, runId, changedQuestions[] | Trust → Reports (refresh caches), Intelligence |
| `trust.conflict_opened` / `.resolved` | conflictId, vehicleId, topic | Trust → Reports, Admin console |
| `garage.job_submitted` | jobId, orgId, submissionId | Garage → (audit/analytics) |
| `notify.message_status` | messageId, status | Notifications → (observability) |

**Recompute debounce:** Trust combines `observation.recorded` events for the same vehicle that arrive within 2 seconds into a single run, so a garage job with 6 observations triggers one recalculation.

## 7. First build slice

Build these endpoints first. Together they prove the whole pipeline end to end on scenario data:

1. `GET /health`, the auth endpoints, `GET /me`
2. `POST /ingest/submissions` + `GET /ingest/submissions/{id}`, used to load the Scenario Dataset through real Ingestion
3. `GET /vehicles/search`, `/summary`, `/report`, `/timeline`, `/evidence`
4. `GET /garage/vehicles/lookup`, `PUT /garage/jobs/{id}`, `POST …/submit`, the evidence upload trio
5. `POST /webhooks/sms/inbound`, `GET`/`POST /attest/{token}`
6. `GET /admin/conflicts`, `GET /admin/conflicts/{id}`, `POST …/actions`

**Definition of done for the slice:** loading all 26 scenarios through Ingestion produces exactly the expected outcomes in Rule Set v1 §12. That's checked by automated tests in CI.

## 8. Open points

- **O-001:** finance and police detail per audience. This fills `report.exposure_policies` rows; the API shape doesn't change.
- **O-002:** fraud report categories. `category` is free text for now, with a provisional list.
- The production domain name for the API (`api.sazo.example` is a placeholder).
- Webhooks *to* partners (pushing updates to banks and insurers) are future work and not in v1.
