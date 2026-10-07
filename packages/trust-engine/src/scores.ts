// Record confidence (Rule Set §8) and Vehicle Health v1 (§9). Two separate scores (P-001).
import type { Question, RecordConfidenceLevel } from '@sazo/contracts';
import { PARAMS } from './params.js';
import { monthsBetween, yearOf } from './time.js';
import type { ConflictCandidate, EngineObservation, Fact, HealthResult, QuestionAnswer } from './types.js';
import type { WorkingSet } from './working-set.js';

export function recordConfidence(ws: WorkingSet, qualifying: EngineObservation[], conflicts: ConflictCandidate[]) {
  const p = PARAMS.recordConfidence;
  const records = qualifying.length;
  const sources = new Set(qualifying.map((o) => ws.org(o))).size;
  const open = conflicts.filter((c) => c.open);
  let level: RecordConfidenceLevel;
  if (records < p.insufficientBelow) level = 'insufficient';
  else if (open.some((c) => c.serious) || records < p.lowBelow) level = 'low';
  else if (records >= p.highMinRecords && sources >= p.highMinSources && open.length === 0) level = 'high';
  else level = 'medium';
  return { level, records, sources, openConflicts: open.length };
}

export function vehicleHealth(
  ws: WorkingSet,
  qualifying: EngineObservation[],
  facts: Record<string, Fact>,
  questions: Record<Question, QuestionAnswer>,
  rcLevel: RecordConfidenceLevel,
): HealthResult {
  const h = PARAMS.health;
  if (rcLevel === 'insufficient' || (questions.care.status === 'not_available' && questions.mileage.status === 'not_available')) {
    return { insufficient: true, score: null, band: null, deductions: [] };
  }
  const asOf = ws.ctx.asOf;
  const of = (...types: string[]) => qualifying.filter((o) => types.includes(o.type));
  const inspections = of('inspection_result').filter((o) => o.eventTime).sort((a, b) => Date.parse(b.eventTime!) - Date.parse(a.eventTime!));
  const lastInspection = inspections[0];
  const recentPass = inspections.find((o) => o.attributes.passed === true && monthsBetween(o.eventTime!, asOf) <= h.recentInspectionMonths);
  const base = recentPass ? h.baseWithRecentInspection : h.baseOtherwise;

  const deductions: { key: string; points: number }[] = [];
  const add = (key: string, points: number) => points && deductions.push({ key, points });

  const structuralEvents = new Set(
    of('damage_assessed', 'repair_performed').filter((o) => o.attributes.structural === true).map((o) => o.eventTime?.slice(0, 7)),
  );
  const title = facts.title_status?.value;
  // A rebuilt / total-loss title already implies structural damage: it replaces that deduction.
  if (title === 'rebuilt' || title === 'total_loss') add(`health.deduction.${title}`, h.rebuilt);
  else if (structuralEvents.size) add('health.deduction.structural_damage', h.structural);
  if (of('flood_damage_reported').length) add('health.deduction.flood', h.flood);
  // Non-structural accidents: one per month, ignoring months that already carry a structural deduction.
  const accidentMonths = new Set(of('accident_reported', 'insurance_claim').map((o) => o.eventTime?.slice(0, 7)).filter((m) => !structuralEvents.has(m)));
  if (accidentMonths.size) add('health.deduction.accidents', Math.max(h.accidentMax, accidentMonths.size * h.accidentEach));

  if (questions.mileage.status === 'serious') add('health.deduction.mileage_serious', h.mileageSerious);
  else if (questions.mileage.status === 'attention') add('health.deduction.mileage_attention', h.mileageAttention);
  if (questions.mileage.headlineKey.endsWith('odometer_replaced')) add('health.deduction.odometer_replaced', h.odometerReplaced);
  const usage = (facts.usage_history?.value as string[] | undefined) ?? [];
  if (usage.some((u) => u === 'rental' || u === 'psv' || u === 'commercial')) add('health.deduction.rental_or_commercial_use', h.rentalOrPsv);
  if (questions.care.status === 'attention') add('health.deduction.care_attention', h.careAttention);

  const km = facts.current_mileage_km?.value as number | undefined;
  if (km && km > 50_000) add('health.deduction.mileage_over_50k', Math.max(h.mileageMax, Math.floor((km - 50_000) / 50_000) * h.per50kOver50k));
  const year = facts.year?.value as number | undefined;
  if (year) {
    const age = yearOf(asOf) - year;
    if (age > 8) add('health.deduction.age', Math.max(h.ageMax, (age - 8) * h.agePerYearOver8));
  }
  const defects = (lastInspection?.attributes.defects as { severity: 'minor' | 'major' }[] | undefined) ?? [];
  const defectPoints = defects.reduce((sum, d) => sum + (d.severity === 'major' ? h.defectMajor : h.defectMinor), 0);
  if (defectPoints) add('health.deduction.inspection_defects', defectPoints);

  const score = Math.max(0, Math.min(100, base + deductions.reduce((s, d) => s + d.points, 0)));
  const band = score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor';
  return { insufficient: false, score, band, deductions, base };
}
