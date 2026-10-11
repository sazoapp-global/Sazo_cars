// Turns the report, timeline and record ledger into what the report screen shows. Everything here comes
// from real records; when a record is missing the screen says so instead of filling the gap.
import { PANEL_LABELS, RECORD_LABELS, factValue, formatKm, type Panel } from '@sazo/contracts';
import type { FullReport, LedgerItem, TimelineItem } from '@/lib/types';

export interface CarPhoto { photoId: string; takenAt: string; takenBy: string }

export interface ReportExtras {
  timeline?: TimelineItem[];
  ledger?: LedgerItem[];
  photos?: CarPhoto[];
}

const words = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const garageName = (sourceLabel: string) => sourceLabel.replace(/^Garage record · /, '').replace(/^Inspection · /, '');

export function factMap(r: FullReport) {
  const m = new Map(r.facts.map((f) => [f.key, f.value]));
  return { get: (k: string) => m.get(k), text: (k: string) => (m.has(k) ? factValue(k, m.get(k)) : undefined) };
}

const counted = (ledger: LedgerItem[] | undefined) => (ledger ?? []).filter((l) => !l.excluded);
const first = (ledger: LedgerItem[] | undefined, type: string) => counted(ledger).find((l) => l.type === type);

/** One line per record on a garage visit ("Service: Engine oil, Oil filter"). Costs are never shown (P-007). */
function describeRecord(l: LedgerItem): string | undefined {
  const a = l.attributes;
  switch (l.type) {
    case 'service_performed': return `${RECORD_LABELS.service_performed}: ${((a.items as string[]) ?? []).map(words).join(', ') || 'details not given'}`;
    case 'component_replaced': return `${words(String(a.component ?? 'Part'))} replaced${a.reason ? ` (${words(String(a.reason)).toLowerCase()})` : ''}`;
    case 'repair_performed': return `Repair${Array.isArray(a.components) && a.components.length ? `: ${(a.components as string[]).map(words).join(', ')}` : ''}${a.structural ? ' (structural)' : ''}`;
    case 'paint_work': return `Paint work${Array.isArray(a.areas) && a.areas.length ? `: ${(a.areas as string[]).map((p) => PANEL_LABELS[p as Panel] ?? words(p)).join(', ')}` : ''}`;
    case 'odometer_reading': case 'cost_recorded': return undefined;
    default: return RECORD_LABELS[l.type];
  }
}

export interface Visit { eventId: string; at: string | null; precision: string; km: number | null; garage: string; lines: string[]; description?: string; photos: number; confirmed: boolean }

/** Garage visits, newest first, with what was done. */
export function garageVisits(x: ReportExtras): Visit[] {
  const byEvent = new Map<string, LedgerItem[]>();
  for (const l of counted(x.ledger)) if (l.eventId) byEvent.set(l.eventId, [...(byEvent.get(l.eventId) ?? []), l]);
  return (x.timeline ?? [])
    .filter((t) => t.type === 'garage_job')
    .map((t) => {
      const recs = byEvent.get(t.eventId) ?? [];
      const lines = recs.map(describeRecord).filter((s): s is string => !!s);
      const description = recs.map((r) => r.attributes.description).find((d): d is string => typeof d === 'string' && d.length > 0);
      return {
        eventId: t.eventId, at: t.time.at, precision: t.time.precision, km: t.mileageKm, garage: garageName(t.sourceLabel),
        lines: lines.length ? lines : (t.params.records ?? []).filter((r) => r !== 'odometer_reading' && r !== 'cost_recorded').map((r) => RECORD_LABELS[r] ?? words(r)),
        description, photos: t.evidenceCount, confirmed: t.ownerConfirmation === 'confirmed',
      };
    })
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** The garage that looked after the car most often, and its usual gap between visits. */
export function mainGarage(visits: Visit[]): { name: string; visits: number; everyKm: number | null } | undefined {
  if (!visits.length) return undefined;
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(v.garage, (counts.get(v.garage) ?? 0) + 1);
  const [name, n] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  const kms = visits.filter((v) => v.garage === name && v.km !== null).map((v) => v.km!).sort((a, b) => a - b);
  const gaps = kms.slice(1).map((k, i) => k - kms[i]!).filter((g) => g > 0);
  const everyKm = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length / 500) * 500 : null;
  return { name, visits: n, everyKm };
}

export interface Reading { at: string; km: number; source: string }

/** Every dated mileage reading, oldest first (auction export reading included when recorded in km). */
export function mileageReadings(x: ReportExtras): Reading[] {
  const out: Reading[] = (x.timeline ?? []).filter((t) => t.mileageKm !== null && t.time.at).map((t) => ({ at: t.time.at!, km: t.mileageKm!, source: garageName(t.sourceLabel) }));
  const auction = first(x.ledger, 'auction_sale');
  const em = auction?.attributes.exportMileage as { value?: number; unit?: string } | undefined;
  if (auction?.time.at && em?.value && em.unit === 'km' && !out.some((o) => o.at === auction.time.at)) out.push({ at: auction.time.at, km: em.value, source: 'Auction record' });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function kmPerYear(readings: Reading[]): number | null {
  if (readings.length < 2) return null;
  const a = readings[0]!, b = readings.at(-1)!;
  const years = (Date.parse(b.at) - Date.parse(a.at)) / (365.25 * 86400e3);
  return years >= 0.5 ? Math.round((b.km - a.km) / years / 100) * 100 : null;
}

/** Where it came from: import, auction and customs records. */
export function origin(r: FullReport, x: ReportExtras) {
  const imp = first(x.ledger, 'import_recorded');
  const auction = first(x.ledger, 'auction_sale');
  const f = factMap(r);
  return {
    country: f.text('import_origin'),
    port: imp?.attributes.port as string | undefined,
    importedAt: imp?.time.at ?? null,
    auctionGrade: auction?.attributes.auctionGrade as string | undefined,
    customs: counted(x.ledger).some((l) => l.type === 'customs_cleared'),
    firstRegistered: f.text('first_registration_date'),
    owners: f.get('owner_count') as number | undefined,
    usage: f.text('usage_type'),
  };
}

const DAMAGE_TYPES = ['accident_reported', 'damage_assessed', 'insurance_claim', 'total_loss_declared', 'flood_damage_reported', 'repair_performed', 'paint_work'];

/** Accident, insurance, flood, repair and paint records, newest first. */
export function damageRecords(x: ReportExtras) {
  return counted(x.ledger)
    .filter((l) => DAMAGE_TYPES.includes(l.type))
    .map((l) => ({ id: l.observationId, at: l.time.at, precision: l.time.precision, label: describeRecord(l) ?? RECORD_LABELS[l.type] ?? words(l.type), source: garageName(l.sourceLabel) }))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export type Match = 'same' | 'differs' | 'replaced' | 'one';
export interface IdentityRow { label: string; record?: string; latest?: string; result: Match }

/** What the official records say against what was recorded on the car later. */
export function identityRows(r: FullReport, x: ReportExtras): IdentityRow[] {
  const f = factMap(r);
  const spec = first(x.ledger, 'spec_declared')?.attributes ?? {};
  const reg = first(x.ledger, 'registration_issued')?.attributes ?? {};
  const inspected = [...counted(x.ledger)].reverse().find((l) => l.type === 'inspection_result')?.attributes ?? {};
  const engineReplaced = r.questions.find((q) => q.question === 'identity')?.notes?.some((n) => n.key === 'identity.note.engine_replaced') ?? false;
  const row = (label: string, record: unknown, latest: unknown, replaced = false): IdentityRow | undefined => {
    const a = record === undefined || record === null ? undefined : String(record);
    const b = latest === undefined || latest === null ? undefined : String(latest);
    if (!a && !b) return undefined;
    const result: Match = !a || !b ? 'one' : a.replace(/\s/g, '').toLowerCase() === b.replace(/\s/g, '').toLowerCase() ? 'same' : replaced ? 'replaced' : 'differs';
    return { label, record: a, latest: b, result };
  };
  const cap = (v: unknown) => (v === undefined ? undefined : factValue('current_colour', v));
  return [
    row('Number plate', reg.plate, r.vehicle.currentPlate),
    row('Make and model', spec.make ? `${spec.make} ${spec.model ?? ''}`.trim() : undefined, f.get('make') ? `${f.get('make')} ${f.get('model') ?? ''}`.trim() : undefined),
    row('Year', spec.year, f.get('year')),
    row('Colour', cap(spec.colour ?? f.get('registered_colour')), cap(inspected.observedColour ?? f.get('current_colour'))),
    row('Engine number', spec.engineNumber ?? f.get('registered_engine_number'), f.get('current_engine_number'), engineReplaced),
    row('Engine size', spec.engineCc ? `${Number(spec.engineCc).toLocaleString('en-UG')} cc` : undefined, undefined),
  ].filter((x): x is IdentityRow => !!x);
}

export type Tone = 'ok' | 'warn' | 'bad' | 'na';
const st = (tone: Tone, text: string) => ({ tone, text });

/** Police, loan and customs: status only, never the details (D-006). */
export function legalStatus(r: FullReport, x: ReportExtras) {
  const f = factMap(r);
  const stolen = f.get('stolen_status');
  const finance = f.get('finance_status');
  const impound = f.get('impound_status');
  return {
    police: stolen === 'open' ? st('bad', 'Reported stolen — open report') : stolen === 'recovered' ? st('warn', 'Recovered after a theft report') : impound === 'impounded' ? st('bad', 'Impounded') : st('ok', 'No open police report on record'),
    loan: finance === 'active' ? st('bad', 'A loan on this car is recorded') : finance === 'cleared' ? st('ok', 'A recorded loan was paid off') : st('ok', 'No loan on record'),
    customs: counted(x.ledger).some((l) => l.type === 'customs_cleared') ? st('ok', 'Customs clearance recorded') : counted(x.ledger).some((l) => l.type === 'import_recorded') ? st('na', 'Import recorded; no clearance record yet') : st('na', 'No customs record yet'),
  };
}

export const kmText = (km: number | null | undefined) => (km === null || km === undefined ? '—' : formatKm(km));
