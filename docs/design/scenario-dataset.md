# SAZO Scenario Dataset v0.1

**Status:** Draft for review · **Date:** 7 October 2026 · v0.1.1 (checked against Rule Set v1)
**Built on:** Decisions Log, Domain Model v0.2, Rule Set v1 (`rs-2026.10-v1`)

## 1. Purpose

This dataset of fictional vehicles is the single source of test data for the MVP. It does three jobs:

1. **Demo data.** Each vehicle tells a realistic Ugandan vehicle story that partners will recognise (D-013).
2. **Test cases.** Each scenario lists the **expected outcome**: the question statuses, flags, conflicts and record confidence. The Trust module passes when its output matches. These become automated tests.
3. **Model check.** Writing the stories exposed nine gaps in the domain model (section 7). They're cheaper to fix now than once they're tables.

**Conventions**
- Every vehicle, plate, chassis number, VIN, person and private business here is **fictional** (D-012). Public institutions (registry, revenue authority, police) appear only as *simulated sources*.
- **Test "today" = 1 Oct 2026.** All derivations run "as of" this date, so results are repeatable (gap G4).
- Mileage is in km unless stated. Dates are dd Mon yyyy.
- Status codes in the expected outcomes: **✓** verified · **!** attention · **✗** serious · **–** not available.
- **Baseline:** unless a scenario says otherwise, each vehicle has an official CUS `import_recorded` and a REG `registration_issued` + `spec_declared` at the start of its Ugandan life. Exceptions: S02, S24, S25.
- The seven questions, in order: **I** identity · **C** care · **D** damage · **M** mileage · **P** provenance/story · **L** legal & financial · **V** valuation.

## 2. The cast

### 2.1 Sources (all simulated in the MVP)

| Code | Source | Domain | Evidence class | Coverage assumed (gap G2) |
|---|---|---|---|---|
| REG | Vehicle registry (simulated) | registration | official | All registered vehicles |
| CUS | Revenue authority customs (simulated) | customs | official | All imports since 2015 |
| POL | Police vehicle records (simulated) | police | official | All registered vehicles, stolen/impound since 2018 |
| LIEN | Movable-property security registry (simulated) | finance | official | All registered vehicles since 2019 |
| INS-N | Nile Assurance (fictional insurer) | insurance | official | Only vehicles it insured |
| AUC | JP export auction feed (simulated) | auction | official | Only vehicles it sold |
| INSP | Kampala Vehicle Inspection Centre (fictional) | inspection | inspection | Only vehicles it inspected |
| RENT | Kampala Car Hire (fictional rental) | rental | official | Its own fleet |
| DLR | Ntinda Motors (fictional dealer) | dealer | dealer | Its own stock |
| GAR-* | SAZO Garage (one source per garage) | garage | garage | Only its own jobs |
| OWN | Owner submissions | owner | owner_provided | — |

### 2.2 Garages

| Code | Garage (fictional) | Status | Reputation behaviour |
|---|---|---|---|
| GAR-NSA | Nsambya Auto Care | approved | Good: confirmed records |
| GAR-MUT | Mutungo Auto Works | approved | Good |
| GAR-BWE | Bweyogerere Motor Clinic | approved | Good |
| GAR-KIR | Kireka Quick Service | approved | **Low:** 4 disputed records by mid-2026, involved in S03, S08 and S21 |
| GAR-KAW | Kawempe Auto Fix | **pending verification** | Can't submit (X4) |

### 2.3 Reference data (for valuation and forecasts)

The comparables set holds about 200 fictional sales of common models (Premio, Harrier, RAV4, Fielder, Noah, Probox and others) from 2025–2026, plus service intervals and a parts and labour price list per model family. The counts quoted under "V" below are the comparables that match each scenario.

## 3. Rule assumptions used for the expected outcomes

**Formalised in Rule Set v1** (`SAZO Rule Set v1.md`), which is now the authority. The summary is kept here for readability. Section 12 of the rule set re-checks every expected outcome.

| # | Assumption |
|---|---|
| R1 | **Verified** needs ≥ 2 independent sources **or** ≥ 1 official record, with no open conflict on that topic |
| R2 | **Not available** when there are no qualifying observations **and** no source covering that vehicle that could have reported a negative |
| R3 | `mileage_decrease`: a later reading > 1% below an earlier one → **serious**, unless a declared odometer replacement lies between them |
| R4 | `implausible_mileage_rate`: > 60,000 km/yr for private use, or > 150,000 km/yr for commercial → **attention** |
| R5 | Legal: open stolen report → ✗; active lien → !; stolen-and-recovered in the last 36 months → !; lien discharged → ✓ (with a note) |
| R6 | Damage: structural damage, total loss or flood → ✗; non-structural accident → !; none found *with insurer or police coverage* → ✓ |
| R7 | Care: ≥ 2 services in the last 36 months from approved garages with average confidence ≥ 0.6 → ✓; a gap of more than 24 months or any open dispute → ! |
| R8 | Provenance: import record consistent with registration → ✓; rental, PSV or commercial use, or rebuilt after total loss → ! |
| R9 | Valuation: ≥ 5 comparables → ✓; 2–4 → ! (wide range); < 2 → – |
| R10 | Record confidence: **High** = ≥ 8 records from ≥ 3 sources and no open conflict · **Medium** · **Low** = open serious conflict or < 5 records · **Insufficient** = < 3 records |
| R11 | Owner attestation (registered owner): confirmed +0.10, disputed −0.30. A **customer** who isn't the registered owner: +0.05 / −0.15 (gap G3) |

## 4. Scenario overview

| # | Plate | Vehicle (fictional) | Story | Mainly tests |
|---|---|---|---|---|
| S01 | UBJ 214K | 2016 Toyota Harrier | Clean, complete history | The "gold standard" happy path |
| S02 | UAX 553F | 2010 Toyota Premio | Only a registration record | Thin data never looks good |
| S03 | UBC 718P | 2015 Toyota RAV4 | Mileage rolled back locally | `mileage_decrease`, open conflict |
| S04 | UBE 260R | 2012 Toyota Mark X | Clocked before import | Export mileage vs local reading |
| S05 | UBA 905T | 2013 Toyota Noah | Odometer cluster replaced (legitimately) | Declared reset ≠ rollback (G1) |
| S06 | UBK 482M | 2014 Toyota Premio | Engine replaced, declared, with photos | Engine swap keeps the VIN (D-031) |
| S07 | UBF 119J | 2010 Toyota Wish | Engine number changed, nothing declared | `undeclared_engine_change` |
| S08a/b | UAX 123A | 2011 Premio + 2017 Harrier | Plate cloned onto a Harrier | `cloned_plate_suspected`, multi-match search |
| S09 | UAR 902C → UBQ 330D | 2014 Toyota Probox | Legitimate plate replacement | Plate history; old plate still searchable (G6) |
| S10 | UBG 447L | 2012 Toyota Fielder | Stolen, then recovered | Past legal event |
| S11 | UBH 031N | 2013 Subaru Forester | Currently reported stolen | Serious legal banner |
| S12 | UBD 812W | 2015 Toyota Land Cruiser Prado | Active finance lien | Finance exposure (O-001) |
| S13 | UAZ 664E | 2010 Toyota Allion | Lien registered and discharged | History without alarm |
| S14 | UBB 377Q | 2014 Nissan X-Trail | Structural accident, insurer claim, repaired | Damage ✗ with repair evidence |
| S15 | UAW 208H | 2011 Toyota Vitz | Declared total loss, rebuilt | Salvage status (G5) |
| S16 | UBF 590S | 2013 Honda Fit | Flood damage, no garage history | Damage ✗, care – |
| S17 | UBC 144V | 2014 Toyota Axio | Former rental car | Usage history, high but plausible mileage |
| S18 | UAQ 771B | 2008 Toyota Hiace | Commercial passenger taxi | PSV usage, very high mileage |
| S19 | UBJ 650D | 2015 Mazda CX-5 | Colour changed: declared respray | Explained colour change (G8) |
| S20 | UAT 382G | 2004 Toyota Ipsum | Colour differs, no repaint recorded | Spec conflict |
| S21 | UBG 909K | 2012 Toyota Passo | Owner disputes a garage record | Attestation, reputation |
| S22 | UBE 515C | 2016 Toyota Premio | Driver (not owner) brings the car in | Customer vs owner attestation (G3) |
| S23 | UBA 288X | 2014 Toyota Harrier | Mileage typo, then corrected | `corrects` relation, append-only |
| S24 | UBD 640H | 2012 Subaru Impreza | Owner-entered, later matched to an import | Provisional → merge → active |
| S25 | UAK 090Z | 2006 Mitsubishi Pajero | Owner-entered, never corroborated | Provisional stays unverified |
| S26 | UBK 703A | 2014 Mercedes-Benz C200 | UK import, odometer in miles; VIN typed with an "O" | Unit conversion (G7), fuzzy VIN search (G9) |

**System scenarios:** X1 simulated→real source switch · X2 rule change + full rebuild · X3 merge reversal · X4 unverified garage blocked · X5 duplicate submission.

## 5. Scenario details

Each scenario lists the observations in event-time order: **date · source · type · key values · evidence**. It then gives the **expected outcome**.

### S01: Clean, complete history (2016 Toyota Harrier, UBJ 214K, chassis ZSU60-0071234)
| Date | Source | Observation | Evidence |
|---|---|---|---|
| 14 Feb 2020 | AUC | `auction_sale` grade 4.5, export mileage 41,200 km | auction sheet |
| 02 Apr 2020 | CUS | `import_recorded` origin Japan, via Mombasa; `customs_cleared` | customs entry |
| 20 Apr 2020 | REG | `registration_issued` UBJ 214K; `spec_declared` pearl white, 2.0L petrol, CVT | — |
| 2020–2026 | GAR-NSA | 6× `service_performed` + `odometer_reading` (44,900 → 58,300 → 69,800 → 80,100 → 91,500 → 102,600) | odometer photos; owner confirmed ×6 |
| 10 Jun 2026 | INSP | `inspection_result` pass; no structural findings; tyres 60%; battery good | inspection report |
| — | POL, LIEN, INS-N | no records (covered) | — |

**Expected:** I ✓ · C ✓ · D ✓ · M ✓ · P ✓ · L ✓ · V ✓ (17 comps) · **Record confidence: High** · Health ≈ 85–90 · no flags.

### S02: Thin history (2010 Toyota Premio, UAX 553F, chassis NZT260-3024411)
| Date | Source | Observation |
|---|---|---|
| 11 Mar 2014 | REG | `registration_issued`; `spec_declared` silver 1.5L |

Customs coverage starts in 2015, so the import isn't covered.
**Expected:** I ✓ (1 official) · C – · D ✓ (police covered, none found; no insurer coverage, so headline "No police accident reports found") · M – · P – · L ✓ · V ✓ (22 comps) · **RC: Insufficient** · **Health: "Insufficient history"** (never a number).

### S03: Local mileage rollback (2015 Toyota RAV4, UBC 718P, chassis ACA36-5012345)
| Date | Source | Observation |
|---|---|---|
| 05 Jul 2021 | GAR-NSA | `odometer_reading` 96,500 (photo, owner confirmed) |
| 18 Mar 2023 | INSP | `odometer_reading` 121,000 (photo) |
| 09 Feb 2025 | GAR-KIR | `odometer_reading` 88,400 (no photo: entered before D-057 enforcement; marked legacy) |

**Expected:** `mileage_decrease` (serious) → Conflict(topic mileage, open). M ✗ "A reading is lower than an earlier record" · C ! · **RC: Low** · Health penalised · both readings shown with sources.

### S04: Clocked before import (2012 Toyota Mark X, UBE 260R, chassis GRX130-6045678)
| Date | Source | Observation |
|---|---|---|
| 21 Nov 2019 | AUC | `auction_sale`, export mileage **148,000** |
| 15 Jan 2020 | CUS | `import_recorded` |
| 30 Jan 2020 | REG | `registration_issued` |
| 12 Aug 2020 | GAR-BWE | `odometer_reading` **72,300** (photo) |
| 2021–2025 | GAR-BWE | 3 services, rising from 72,300 |

**Expected:** `mileage_decrease` (export → local) serious. M ✗ "Mileage at export (148,000 km) is higher than later readings" · P ! · C ✓ (services are real) · **RC: Low**.

### S05: Odometer cluster replaced, legitimately (2013 Toyota Noah, UBA 905T, chassis ZRR70-0423456)
| Date | Source | Observation |
|---|---|---|
| 14 Apr 2022 | GAR-MUT | `odometer_reading` 134,000 |
| 03 Jul 2023 | GAR-MUT | `component_replaced` {instrument_cluster, reading_before 141,200, reading_after 12} + photos of both clusters |
| 22 Aug 2024 | GAR-MUT | `odometer_reading` 18,500 (new cluster) |

**Expected:** no `mileage_decrease` (a declared replacement splits the series). M ! "Odometer replaced in Jul 2023; estimated total ≈ 159,700 km" · `current_mileage_km` = estimated total with lower confidence · **RC: Medium**. *Needs G1.*

### S06: Declared engine replacement (2014 Toyota Premio, UBK 482M, chassis NZT260-3048271)
| Date | Source | Observation |
|---|---|---|
| 2019 | CUS, REG | import, registration, engine 1NZ-A111111 |
| 2023–2026 | GAR-MUT | 3 services |
| 12 Sep 2026 | GAR-MUT | event `garage_job`: `component_replaced` {engine, old 1NZ-A111111, new 1NZ-B222222, reason seized}; `odometer_reading` 151,870; `cost_recorded` UGX 4,250,000 (confidential); photos of the engine number and odometer; owner **confirmed** |

**Expected:** VIN and vehicle ID unchanged · `current_engine_number` = 1NZ-B222222 · no `undeclared_engine_change` · I ✓ with note "Engine replaced Sep 2026 (recorded by a verified garage)" · C ✓ · **RC: High**.

### S07: Undeclared engine change (2010 Toyota Wish, UBF 119J, chassis ZNE14-0234567)
| Date | Source | Observation |
|---|---|---|
| 2016 | REG | registration, engine 1ZZ-C333333 |
| 20 Aug 2026 | INSP | `inspection_result` observes engine **1ZZ-D444444** (photo) |

**Expected:** `undeclared_engine_change` (attention) → Conflict(topic identity, under_review). I ! "Engine number differs from the registered record; no replacement recorded" · **RC: Low**.

### S08a/S08b: Cloned plate (UAX 123A)
- **S08a:** 2011 Toyota Premio, white, chassis NZT260-3011111. REG registers it as UAX 123A in 2015. GAR-NSA services it in 2024.
- **S08b:** 2017 Toyota Harrier, silver, chassis ZSU60-0099999. REG registers it as **UBF 778B** in 2021. GAR-KIR records a job in Mar 2025 under plate **UAX 123A**, with a photo of the car showing a silver Harrier.

**Expected:** the plate identifier on both vehicles is `disputed` · `cloned_plate_suspected` (serious) on both → one Conflict linking them · **Searching "UAX 123A" returns 2 vehicles** with a serious banner, and the user chooses · both I ✗ until a reviewer resolves it.

### S09: Legitimate plate replacement (2014 Toyota Probox, chassis NCP160-0045566)
| Date | Source | Observation |
|---|---|---|
| 2016 | REG | `registration_issued` UAR 902C |
| 05 May 2025 | REG | `plate_changed` UAR 902C → UBQ 330D, reason **replacement** |
| 2024–2026 | GAR-BWE | services under both plates |

**Expected:** no clone flag (the change is official and reasoned) · searching either plate finds the vehicle, and the old plate shows "Previous plate (until May 2025)" · all ✓ except V ✓ (9 comps). *Needs G6.*

### S10: Stolen, then recovered (2012 Toyota Fielder, UBG 447L)
POL `stolen_reported` 04 Mar 2024 → POL `stolen_recovered` 19 May 2024. Services before and after at GAR-NSA.
**Expected:** L ! "Reported stolen in Mar 2024 and recovered in May 2024" · other questions ✓.

### S11: Currently stolen (2013 Subaru Forester, UBH 031N)
POL `stolen_reported` 11 Aug 2026, still open.
**Expected:** L ✗ · **a serious banner on the public summary** "This vehicle has an open stolen-vehicle report in available records" · no seller-side details are exposed.

### S12: Active finance lien (2015 Toyota Land Cruiser Prado, UBD 812W)
LIEN `finance_lien_registered` 2024 by Pearl Finance (fictional lender), still active.
**Expected:** L ! "Active finance on record". Whether the lender's name and amount are shown depends on O-001; the default is hidden.

### S13: Lien discharged (2010 Toyota Allion, UAZ 664E)
LIEN `finance_lien_registered` 2021 → `finance_lien_discharged` 2023.
**Expected:** L ✓ "No active finance on record (a previous loan was cleared in 2023)".

### S14: Structural accident, repaired (2014 Nissan X-Trail, UBB 377Q)
| Date | Source | Observation |
|---|---|---|
| 08 Jun 2023 | INS-N | `insurance_claim`; `damage_assessed` front, **structural: yes** |
| Jul 2023 | GAR-BWE | `repair_performed` chassis rail straightened, panels replaced; `paint_work` front |
| Mar 2024 | INSP | `inspection_result` pass; repair quality noted |
| 2024–2025 | GAR-BWE | 2× `service_performed` + `odometer_reading` |

**Expected:** D ✗ "Structural damage recorded in 2023; repaired and later inspected" · C ✓ · Health reduced · **RC: High** (well documented, even though the news is bad). This is the case that shows **Health ≠ Record confidence** (P-001).

### S15: Total loss, rebuilt (2011 Toyota Vitz, UAW 208H)
INS-N `total_loss_declared` Feb 2022 → GAR-BWE rebuild (`repair_performed`) → INSP pass Jan 2023 → REG re-registration.
**Expected:** canonical `title_status` = **rebuilt** · D ✗ "Declared a total loss in 2022 and later rebuilt" · P ! · V ! (rebuilt-adjusted comparables, range ×1.5). *Needs G5.*

### S16: Flood damage, no garage history (2013 Honda Fit, UBF 590S)
INS-N `flood_damage_reported` Apr 2024. Nothing else since its 2019 registration.
**Expected:** D ✗ · C – · M – · **RC: Low** · Health "Insufficient history".

### S17: Former rental car (2014 Toyota Axio, UBC 144V)
RENT `rental_period` Jan 2019–Dec 2022; RENT services quarterly; mileage 38,000 → 246,000 (≈ 52,000 km/yr); privately owned since 2023 with GAR-NSA services.
**Expected:** P ! "Used as a rental car 2019–2022" · M ✓ (consistent; under the 60,000 km/yr threshold) · C ✓.

### S18: Commercial passenger taxi (2008 Toyota Hiace, UAQ 771B)
REG `usage_declared` PSV since 2012; readings up to 412,000 km; several garages.
**Expected:** P ! "Registered for commercial passenger use" · M ✓ (commercial threshold applies) · Health ≈ 45 (Poor: age, mileage and PSV deductions).

### S19: Declared colour change (2015 Mazda CX-5, UBJ 650D)
REG colour **red** (2018) → GAR-NSA `paint_work` {full body, old red, new black, cosmetic} Feb 2024 → INSP observes **black** in 2025.
**Expected:** no conflict · canonical `registered_colour` = red, `current_colour` = black, with a note "Fully repainted Feb 2024 (red → black)". *Needs G8.*

### S20: Colour mismatch, nothing recorded (2004 Toyota Ipsum, UAT 382G)
REG colour **silver** → INSP observes **blue** in Jul 2026; no paint record.
**Expected:** Conflict(topic spec) open · I ! "Colour differs from the registered record; no repaint recorded".

### S21: Owner disputes a garage record (2012 Toyota Passo, UBG 909K)
GAR-KIR records a service at 64,000 km on 15 Jul 2026. The registered owner replies **"2" (dispute)**: "The car was in Mbarara that week."
**Expected:** Attestation disputed → that observation's confidence drops by 0.30 · Conflict(topic care) open · C ! · GAR-KIR reputation falls (dispute rate) and applies to all its records.

### S22: Customer is not the registered owner (2016 Toyota Premio, UBE 515C)
A driver brings the car to GAR-NSA. The phone number recorded belongs to the driver, not the registered owner, so the phone hashes don't match. The driver confirms by SMS.
**Expected:** attestation recorded as `customer`, not `registered_owner` · smaller confidence gain (+0.05) · the report says "Confirmed by the customer", not "by the owner". *Needs G3.*

### S23: Mileage typo, then corrected (2014 Toyota Harrier, UBA 288X)
GAR-MUT enters **1,540,000** km on 02 Mar 2026. The next day GAR-MUT submits a correction to **154,000** (`corrects` relation).
**Expected:** before the correction: `implausible_mileage_rate` flag · after: flag cleared, and the original stays in the ledger marked "Corrected by the same garage on 03 Mar 2026" · M ✓.

### S24: Owner-entered vehicle, later matched (2012 Subaru Impreza, UBD 640H)
1. Jun 2025: an owner searches UBD 640H, gets "not found", and adds the details. This creates a **provisional** vehicle with plate only, make/model Subaru Impreza, mileage 97,000.
2. Jan 2026: a CUS import record arrives with chassis GP3-0123456 and plate UBD 640H.
3. The resolver returns **ambiguous** (plate match, no anchor on the provisional vehicle), and a reviewer merges the two.

**Expected:** one active vehicle; the provisional one is `merged` · the owner's details stay in the history, labelled "Owner-provided" · I ✓ after the merge.

### S25: Owner-entered, never corroborated (2006 Mitsubishi Pajero, UAK 090Z)
Owner-provided only: plate, model and mileage 210,000.
**Expected:** status **provisional** · I ! "Owner-provided, not yet verified" · everything else – · **RC: Insufficient** · never shown with a verified badge.

### S26: UK import in miles, VIN typed with "O" (2014 Mercedes-Benz C200, UBK 703A, VIN WDD2050042F123456)
CUS `import_recorded` origin UK; export mileage **46,000 miles** (original value and unit kept). GAR-NSA `odometer_reading` 79,500 km in 2021, rising after that.
**Expected:** 46,000 mi ≈ 74,030 km, so the series is consistent and M ✓ · searching "WDD2O5OO42F123456" (with letter O) → "Did you mean WDD2050042F123456?", which matches. *Needs G7, G9.*

### System scenarios

| # | Scenario | Expected |
|---|---|---|
| X1 | The real "Vehicle registry" source goes live; REG (simulated) is retired with `superseded_by` | After a full rebuild, simulated REG observations are excluded but still visible in the ledger; reports switch to real-source wording; no code change |
| X2 | Rule change: R4 private threshold changed from 60,000 to 50,000 km/yr | New rule-set version; a full rebuild changes S17 to M !; old outputs remain traceable to the old version |
| X3 | The S24 merge turns out to be wrong; a reviewer reverses it | A new reversal record; the provisional vehicle is restored; observations untouched |
| X4 | GAR-KAW (pending verification) submits a job | Rejected at Ingestion: "Organisation not yet approved" (D-055) |
| X5 | GAR-MUT's app resends the S06 job after a network drop, with the same idempotency key | Stored once; the second request returns the original result |

## 6. Coverage check

| Capability | Scenarios |
|---|---|
| Happy path, all ✓ | S01, S06, S09 |
| Thin or missing data | S02, S16, S25 |
| Mileage checks | S03, S04, S05, S23, S26 |
| Identity: VIN/chassis, plates, engines | S06, S07, S08, S09, S24, S26 |
| Legal and finance | S10, S11, S12, S13 |
| Damage | S14, S15, S16 |
| Usage and provenance | S04, S15, S17, S18 |
| Spec and colour | S19, S20 |
| Attestation and reputation | S01, S06, S21, S22 |
| Corrections and append-only | S23, X3 |
| Merge and provisional vehicles | S24, S25, X3 |
| Sources and rules | X1, X2, X4, X5 |
| Health ≠ Record confidence | S14 (bad car, well documented) vs S02 (unknown car) |

## 7. Gaps found in Domain Model v0.1 (now fixed in v0.2)

| Gap | Problem found by | Fix |
|---|---|---|
| **G1** | S05: replacing an odometer is a legitimate reset that looks like a rollback | `component_replaced` supports `instrument_cluster` with `reading_before` / `reading_after`. Trust splits the mileage series into segments and estimates the total |
| **G2** | S02, S14: "no stolen report found" only means something if the source covers that vehicle | New `SourceCoverage` (domain, scope, period) on each Source. A negative counts only where coverage applies |
| **G3** | S22: the person who confirms may be the driver, not the owner | Attestation `attester_kind` gains `customer` vs `registered_owner` (decided by matching the phone hash against the owner Party), with different weights |
| **G4** | Tests must be repeatable; "age" factors change daily | Trust derivations take an explicit `as_of` time and store it |
| **G5** | S15: total-loss and rebuilt vehicles need a lasting status | New canonical fact `title_status`: `clean` · `total_loss` · `rebuilt` |
| **G6** | S09 vs S08: a legitimate plate change must not look like cloning | `plate_changed` requires a `reason` (`replacement` · `re_registration` · `personalised` · `correction`); only overlapping plates *without* an official change raise the clone flag |
| **G7** | S26: odometers in miles | `odometer_reading` keeps `original_value` + `original_unit`; Trust converts to km for the series |
| **G8** | S19: registered colour vs current colour | Canonical facts split into `registered_colour` and `current_colour` (likewise `registered_engine_number` vs `current_engine_number`) |
| **G9** | S26: people type O for 0 and I for 1 | Search normalisation suggests corrected VINs ("Did you mean…") instead of failing silently |

## 8. Next

1. You confirm the scenarios read like realistic Ugandan vehicle stories; add any situation you've seen in the market that's missing.
2. **Rule Set v1** formalises R1–R11 and confirms every expected outcome above.
3. The scenarios become seed files (JSON per source, shaped like what each source sends) and automated tests in the first build slice.
