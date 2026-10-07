# SAZO Rule Set v1 (`rs-2026.10-v1`)

**Status:** Draft for review · **Date:** 7 October 2026
**Built on:** Decisions Log · Domain Model v0.2 · Scenario Dataset v0.1 (whose rule assumptions R1–R11 this document formalises)

## 0. What this is

These are the rules the Trust module (and, for Health, Valuation and Forecast, the Intelligence module) uses to turn observations into judgements. They are **deliberately simple and transparent** (D-024, D-062): every number shown to a user can be traced to a rule in this document.

- **Versioned.** Every derived output stores `rule_set_version = rs-2026.10-v1` and its `as_of` time (G4). Changing any number in this document creates a new version (X2).
- **Tunable.** All thresholds are listed in section 11 and live in configuration, not code.
- **Tested.** Section 12 checks every scenario's expected outcome against these rules.

---

## 1. Which observations count

An observation is **excluded** from derivation (but still shown in the evidence ledger, with the reason) when:

| Reason | Rule |
|---|---|
| Retracted | A `retracts` relation points to it |
| Corrected | A `corrects` relation points to it; the correcting observation counts instead |
| Retired simulated source | Its source is simulated and retired with `superseded_by` (DM-5, X1) |
| Duplicate | A `duplicates` relation marks it as a copy of an earlier observation |

An observation is **weak** when its confidence is **< 0.40** (section 3). Weak observations are shown, but they can't make anything "verified" and they don't count towards record confidence.

**Independent** means coming from a different organisation. Two observations from the same garage are never independent of each other.

---

## 2. Source reputation

| Evidence class | Baseline reputation |
|---|---|
| official (registry, customs, police, lien registry, insurer, auction, rental company records) | 0.90 |
| inspection | 0.85 |
| garage (approved) | 0.70, then adjusted (below) |
| dealer | 0.60 |
| owner_provided | 0.35 |
| community | not used for vehicle facts (D-063) |

**Garage adjustment.** This is recalculated whenever an attestation arrives:

```
reputation = clamp( 0.70
                    + 0.15 × confirmed / (confirmed + disputed + 5)
                    − 0.80 × disputed  / (confirmed + disputed + 5),
                    0.30, 0.90 )
```

The "+5" stops one early dispute from wrecking a new garage. A garage with **reputation < 0.60 is "low"**. Its records are flagged as such in reviews and the admin console.

*Example (GAR-KIR, mid-2026):* 6 confirmed, 4 disputed → 0.70 + 0.06 − 0.213 = **0.55 (low)**.

A suspended organisation's reputation is capped at 0.30 from the suspension date onward.

---

## 3. Observation confidence

```
confidence = clamp( source_reputation
                    + evidence_bonus
                    + corroboration_bonus
                    + attestation_effect
                    + consistency_penalty
                    + legacy_penalty,
                    0.05, 0.99 )
```

| Factor | Value |
|---|---|
| `evidence_bonus` | +0.10 if the type's primary evidence is attached (odometer photo, engine-number photo, official document, inspection report) |
| `corroboration_bonus` | +0.05 per independent observation that agrees (same fact within tolerance: mileage ±2% and consistent date order; same identifier; same colour), max +0.10 |
| `attestation_effect` | registered owner: confirmed **+0.10**, disputed **−0.30** · customer (not the registered owner): confirmed **+0.05**, disputed **−0.15** (G3) · no response: 0 |
| `consistency_penalty` | −0.30 if the observation is involved in an open **serious** flag; −0.15 if in an open **attention** flag |
| `legacy_penalty` | −0.10 if required evidence is missing (records created before the evidence rule D-057, or by simulated sources) |

The full factor breakdown is stored with each assessment, so the UI can explain any confidence value.

---

## 4. Consistency checks

| ID | Check | Definition | Severity |
|---|---|---|---|
| C1 | `mileage_decrease` | Put all non-excluded odometer readings in km order by event time, including export mileage. **Split the series into segments at every declared `instrument_cluster` replacement** (G1). Within a segment, a reading more than 1% below the highest earlier reading is flagged, along with that earlier reading | serious |
| C2 | `implausible_mileage_rate` | For consecutive readings at least 30 days apart in one segment, annualised rate > threshold for the usage at that time: private 60,000 · rental 100,000 · commercial/PSV 150,000 km/yr. **Or** any single reading > 1,000,000 km | attention |
| C3 | `undeclared_engine_change` | An observed engine number (inspection, garage or registry) differs from the expected engine number at that date (registered engine plus declared `component_replaced{engine}` up to that date) | attention |
| C4 | `plate_vin_mismatch` | A submission's plate resolves to vehicle A, but its VIN/chassis belongs to vehicle B | serious |
| C5 | `cloned_plate_suspected` | The same normalized plate is active on two vehicles in overlapping periods, **with no official `plate_changed` linking them** (G6) | serious (on both vehicles) |
| C6 | `identity_collision` | The same VIN/chassis is claimed by two active vehicles | serious |
| C7 | `duplicate_suspected` | A provisional vehicle shares a plate with an active vehicle | info → review queue |
| C8 | `date_impossible` | A local garage, registration or inspection event before the import date of an imported vehicle, or any event after deregistration | attention |
| C9 | `spec_mismatch` | Observed colour ≠ expected current colour (registered colour, then each `paint_work` new colour in order) → attention. Observed make/model ≠ registered → serious | attention / serious |
| C10 | auto-duplicate | Same source, same type, same value, within 1 day → a `duplicates` relation is created automatically (X5 safety net) | — |

A flag **clears** automatically when the observations causing it are excluded (e.g. corrected, S23) or when a reviewer resolves its conflict.

---

## 5. Conflicts

| Rule | |
|---|---|
| Open | Every **serious** flag opens a Conflict. Attention flags on identity or spec (C3, C9) open one too. A disputed attestation opens one on the event's topic |
| Group | Flags about the same vehicle and topic join the same open Conflict |
| Auto-resolve | Only when the causing flag clears through exclusion (correction, retraction, retired source). The rule ID is recorded as the resolver |
| Reviewer resolve | Every other conflict. The resolution must record the chosen interpretation and its reasoning. Observations are never edited; the reviewer may add a `retracts`/`corrects` relation (S08 after investigation) |
| Effect | An open conflict blocks "verified" on its topic's question |

---

## 6. Canonical facts

**General rule:** take the non-excluded, non-weak observation with the highest confidence. Break ties by evidence class (official > inspection > garage > dealer > owner_provided), then by the latest event time. Store the supporting and conflicting observation IDs.

**Specific rules:**

| Fact | Rule |
|---|---|
| `current_mileage_km` | Highest reading in the latest segment. **If there's more than one segment:** add each earlier segment's final value (its `reading_before` at the cluster swap) and mark it *estimated*, with confidence × 0.8 (S05: 141,200 − 12 + 18,500 ≈ 159,700) |
| `current_plate` | Latest `registration_issued` / `plate_changed`. Earlier plates are kept as `previous_plate` with their validity |
| `registered_colour` / `current_colour` | Registered = latest official spec. Current = latest of (paint_work new colour, inspection-observed colour, registered) by event time (G8) |
| `registered_engine_number` / `current_engine_number` | Registered = official. Current = latest declared replacement or observed engine number (C3 raises a flag if it's undeclared) |
| `owner_count` | Ugandan registered owners: 1 for the first registration + each `ownership_transferred` |
| `usage_type` | Latest `usage_declared`, or `rental` during an active `rental_period`. `usage_history` lists all periods |
| `finance_status` | `active` if the latest lien event is `registered`; `cleared` if it's `discharged`; `none_found` if the lien source covers the vehicle and has no records; `unknown` otherwise |
| `stolen_status` | `open` if the latest is `stolen_reported`; `recovered` if `stolen_recovered`; `none_found` / `unknown` by coverage |
| `title_status` | `total_loss` if `total_loss_declared` with no later pass inspection; `rebuilt` if a pass `inspection_result` follows; else `clean` (G5) |

---

## 7. The seven questions

Rules are checked **top to bottom; the first match wins.** "Qualifying" means non-excluded, non-weak.

### I: Identity ("Is it really this car?")
| Status | When |
|---|---|
| ✗ serious | Open C4, C5 or C6; or C9 make/model mismatch |
| ! attention | Open C3 or C9 colour conflict; or the vehicle is **provisional** ("Owner-provided, not yet verified") |
| ✓ verified | VIN/chassis anchor supported by ≥ 1 official observation |
| – | Otherwise |

A note is added (not a status change) for a declared engine replacement or full repaint.

### C: Care ("Has it been taken care of?")
| Status | When |
|---|---|
| ! attention | An open dispute on a care event; or exactly 1 qualifying service in the last 36 months; or the latest service > 24 months ago |
| ✓ verified | ≥ 2 qualifying services/repairs (garage or rental-company records) in the last 36 months, average confidence ≥ 0.60 |
| – | No service records |

### D: Damage ("Has anything serious happened to it?")
| Status | When |
|---|---|
| ✗ serious | `damage_assessed` structural = yes; `total_loss_declared`; `flood_damage_reported`; or an open damage conflict |
| ! attention | A non-structural `accident_reported` or `insurance_claim` |
| ✓ verified | No damage observations **and** police or insurer coverage applies to this vehicle (G2). Headline names what was checked, e.g. "No police accident reports found" |
| – | Otherwise |

### M: Mileage ("Can I trust the mileage?")
| Status | When |
|---|---|
| ✗ serious | Open C1 |
| ! attention | Open C2; or the series has > 1 segment (odometer replaced); or only 1 qualifying reading |
| ✓ verified | ≥ 2 qualifying readings spanning ≥ 6 months, consistent, with ≥ 1 reading at confidence ≥ 0.60 |
| – | No qualifying readings |

### P: Provenance ("What's its story?")
| Status | When |
|---|---|
| ! attention | Any rental or commercial/PSV usage period; `title_status` rebuilt or total_loss; or an open C1 involving export/auction mileage |
| ✓ verified | An official `import_recorded` consistent with registration (or official first registration as new) |
| – | Otherwise |

### L: Legal & financial ("Are there money or legal issues?")
| Status | When |
|---|---|
| ✗ serious | `stolen_status` open; or impounded and not released |
| ! attention | `finance_status` active; or stolen-and-recovered within 36 months; or released from impound within 12 months |
| ✓ verified | Police **and** lien coverage apply, with nothing active (a discharged lien or older recovery shows as a note) |
| – | No coverage |

### V: Valuation ("Is the price reasonable?")
| Status | When |
|---|---|
| ! attention | 2–4 comparables (range widened ±10%); or `title_status` rebuilt (rebuilt adjustment, range ×1.5) |
| ✓ verified | ≥ 5 comparables |
| – | < 2 comparables |

### Headlines

Each status carries a `headline_key` + params (e.g. `mileage.serious.decrease {earlier: 121000, later: 88400}`). The wording lives in one template file and follows the wording rules (P-006): state what the records show, never guarantee.

---

## 8. Record confidence (P-001)

Counted over qualifying observations:

| Level | When (first match) |
|---|---|
| **Insufficient** | < 3 qualifying observations |
| **Low** | Any open **serious** conflict; or < 5 qualifying observations |
| **High** | ≥ 8 qualifying observations from ≥ 3 independent sources, and no open conflicts |
| **Medium** | Otherwise |

The breakdown shown to users: "Based on N records from M sources", plus any open conflicts.

---

## 9. Vehicle Health (Intelligence module, v1)

Health describes **the car's condition**, not how good its records are.

**Not computed** (shown as "Insufficient history") when record confidence is *Insufficient*, or when both C and M are "–".

```
health = base − deductions, clamped to 0–100
base   = 95 if a passing inspection in the last 12 months, else 85
```

| Deduction | Points |
|---|---|
| Structural damage | −25 |
| Rebuilt after total loss (replaces the structural-damage deduction; v1.1 clarification) | −35 |
| Flood damage | −30 |
| Non-structural accident | −8 each, max −16 |
| Mileage ✗ / ! | −20 / −5 |
| Odometer replaced | −5 |
| Rental or PSV usage history | −10 |
| Care ! | −8 |
| Mileage above 50,000 km | −5 per full 50,000 km, max −20 |
| Age above 8 years | −1 per year, max −10 |
| Inspection defects | per inspection severity: minor −2, major −10 each |

**Bands:** 80–100 Good (lime) · 50–79 Fair (amber) · 0–49 Poor (red). Every deduction is listed in the UI.

---

## 10. Valuation and forecast (Intelligence module, v1)

**Valuation**
1. **Comparables:** same model family, year ±2, sold in the last 12 months.
2. **Adjust each comparable to this car:**
   - mileage: −1.5% per 10,000 km above the comparable's mileage (+ if below), capped at ±15%
   - non-structural accident: −5%
   - structural damage: −15%
   - flood: −25%
   - rebuilt: −30%
3. **Range** = 25th–75th percentile of the adjusted prices. **Point** = median.
4. **Status** per §7 V. Show the number of comparables and that it's an estimate (D-060).

**Maintenance forecast**
1. For each item in the model family's interval table (oil, filters, brake pads, tyres, battery, timing belt or chain, spark plugs, CVT/ATF), the next due = last recorded service of that item + interval. If the item was never recorded: due now, marked "no record".
2. Expected use: the vehicle's observed annual km, or 15,000 km if that can't be worked out.
3. Items due within 12 months or 15,000 km are listed.
4. **Costs** use the median of the parts and labour price list. Show the total as a range (p25–p75) labelled as an estimate.

---

## 11. Tunable parameters

| Parameter | v1 value |
|---|---|
| Weak observation threshold | 0.40 |
| Low garage reputation threshold | 0.60 |
| Baselines | official 0.90 · inspection 0.85 · garage 0.70 · dealer 0.60 · owner 0.35 |
| Garage reputation weights | +0.15 confirm · −0.80 dispute · smoothing 5 · range 0.30–0.90 |
| Evidence bonus | +0.10 |
| Corroboration | +0.05 each, max +0.10; mileage tolerance ±2% |
| Attestation | owner +0.10 / −0.30 · customer +0.05 / −0.15 |
| Flag penalties | serious −0.30 · attention −0.15 |
| Legacy (missing required evidence) | −0.10 |
| Mileage decrease tolerance | 1% |
| Annual mileage thresholds | private 60,000 · rental 100,000 · commercial 150,000 · absolute 1,000,000 |
| Care window / gap | 36 months / 24 months |
| Recovery and impound attention windows | 36 months / 12 months |
| Record confidence | insufficient < 3 · low < 5 · high ≥ 8 records and ≥ 3 sources |
| Health base | 95 with an inspection in the last 12 months / 85 otherwise |
| Valuation | ≥ 5 comparables verified · 2–4 widened ±10% · rebuilt ×1.5 |

---

## 12. Expected outcomes checked against v1

**Baseline convention (added to the Scenario Dataset):** unless a scenario says otherwise, each vehicle has an official CUS `import_recorded` and a REG `registration_issued` + `spec_declared` at the start of its Ugandan life. Exceptions: S02 (pre-2015 import, not covered), S24 (provisional at first), S25 (owner-provided only).

| # | I | C | D | M | P | L | V | Record confidence | Health | Check |
|---|---|---|---|---|---|---|---|---|---|---|
| S01 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High | 88 (95 −5 mileage −2 age) | ✅ |
| S02 | ✓ | – | ✓ | – | – | ✓ | ✓ | Insufficient | Insufficient history | ✅ |
| S03 | ✓ | ! (1 service in 36 mo) | ✓ | ✗ | ✓ | ✓ | ✓ | Low | **49** (85 −20 mileage −8 care −5 km −3 age) | ✅ tested |
| S04 | ✓ | ✓ | ✓ | ✗ | ! | ✓ | ✓ | Low | **54** | ✅ tested |
| S05 | ✓ | ✓ | ✓ | ! (2 segments) | ✓ | ✓ | ✓ | **High** | **60** | ✅ tested (cluster swap dated Nov 2023) |
| S06 | ✓ + note | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High | **71** | ✅ tested |
| S07 | ! | – | ✓ | – | ✓ | ✓ | ✓ | Low (< 5 records) | **Insufficient history** (C and M both –) | ✅ tested |
| S08a/b | ✗ | ✓ / **!** | ✓ | ✓ / – | ✓ | ✓ | ✓ | Low | — | ✅ tested (S08b has one Kireka visit → C !) |
| S09 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High | — | ✅ (baseline adds the 2016 import) |
| S10 | ✓ | ✓ | ✓ | ✓ | ✓ | ! | ✓ | High | — | ✅ |
| S11 | ✓ | – | ✓ | – | ✓ | ✗ | ✓ | Low | — | ✅ |
| S12 | ✓ | – | ✓ | – | ✓ | ! | ✓ | Low | — | ✅ |
| S13 | ✓ | – | ✓ | – | ✓ | ✓ + note | ✓ | **Medium** (5 records, 3 sources) | — | ✅ tested |
| S14 | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | High | **51** | ✅ tested |
| S15 | ✓ | ✓ | ✗ | ✓ | ! | ✓ | ! | **High** | **38** (rebuilt replaces the structural deduction) | ✅ tested |
| S16 | ✓ | – | ✗ | – | ✓ | ✓ | ✓ | Low | Insufficient history (C and M both –) | ✅ |
| S17 | ✓ | ✓ | ✓ | ✓ | ! | ✓ | ✓ | High | **51** | ✅ tested |
| S18 | ✓ | ✓ | ✓ | ✓ | ! | ✓ | ! (few comps) | High | ≈ 45 | ✅ **(dataset updated: "Health ≈ 45, Poor", not "moderate")** |
| S19 | ✓ + note | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High | — | ✅ |
| S20 | ! | – | ✓ | – | ✓ | ✓ | ✓ | Low | — | ✅ |
| S21 | ✓ | ! | ✓ | ✓ | ✓ | ✓ | ✓ | Medium | — | ✅ |
| S22 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High | — | ✅ |
| S23 | ✓ | ✓ | ✓ | ✓ (after the correction) | ✓ | ✓ | ✓ | High | — | ✅ |
| S24 | ! → ✓ after merge | – | ✓ | – | ✓ | ✓ | ✓ | Low | — | ✅ |
| S25 | ! | – | – | – | – | – | ✓ | Insufficient | Insufficient history | ✅ (D, L "–": no official identity, so coverage can't be applied) |
| S26 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ! (3 comps) | High | — | ✅ |

"—" in Health means it isn't specified by the scenario. It's computed, but not asserted in tests.

**Verified by code (7 Oct 2026).** These outcomes are now automated tests in `packages/scenarios` and all pass. Writing them as code corrected the hand-calculated values marked in bold above: S03/S05/S06/S07/S14/S15/S17 health, S05/S13/S15 record confidence, S08b care. It also clarified that a rebuilt title replaces (rather than adds to) the structural deduction.

**Three scenario updates came out of the first, manual check.** They're applied to the Scenario Dataset:
- S14 gains two services
- S15's valuation becomes !
- S18's health becomes ≈ 45 (Poor)

## 13. Known limitations of v1 (on purpose)

- No age decay of confidence: an old official record counts as much as a new one.
- No machine learning; anomaly detection is limited to the checks C1–C10.
- Reputation covers garages only. Official sources are fixed at their baseline until real partners give us error-rate data.
- Valuation ignores trim and options unless the reference data separates them.

These are candidates for v2, once real data shows where v1 is wrong.
