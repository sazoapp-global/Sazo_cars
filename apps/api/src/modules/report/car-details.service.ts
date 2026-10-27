// "About this car" (D-148): the kind of car and the other details, each with where it came from. A registry,
// inspector, garage, dealer or owner record comes first (the strongest wins, as for make and model); then a SAZO
// admin's decision for the kind; then SAZO's model list (the kind identified from the chassis code or the model,
// and the maker's figures, marked test data until real maker specifications are loaded); then the owners' fuel log.
import { Inject, Injectable } from '@nestjs/common';
import { CAR_DETAIL_KEYS, isVehicleKind, kindFromText, type CarDetail, type CarDetailKey, type DetailSource, type VehicleKind } from '@sazo/contracts';
import { ObservationsService, type StoredObservation } from '../obs/index.js';
import { ReferenceService, type ModelSpecRow } from '../ref/index.js';
import { TrustService } from '../trust/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { FuelService } from './fuel.service.js';

const CLASS_SOURCE: Record<string, DetailSource> = { official: 'registry', inspection: 'inspector', garage: 'garage', dealer: 'dealer', owner_provided: 'owner', community: 'owner' };
/** Detail → canonical fact key, and → the column in SAZO's model list. */
const FACTS: Partial<Record<CarDetailKey, string>> = {
  engineCc: 'engine_cc', powerHp: 'power_hp', cylinders: 'cylinders', drive: 'drive', fuelKmPerL: 'fuel_km_per_l', seats: 'seats', doors: 'doors',
  steering: 'steering', year: 'year', loadTonnes: 'load_tonnes', gvwTonnes: 'gvw_tonnes', axles: 'axles',
};
const SPEC: Partial<Record<CarDetailKey, keyof ModelSpecRow>> = {
  engineCc: 'engineCc', powerHp: 'powerHp', cylinders: 'cylinders', drive: 'drive', fuelKmPerL: 'fuelKmPerL', seats: 'seats', doors: 'doors',
  loadTonnes: 'loadTonnes', gvwTonnes: 'gvwTonnes', axles: 'axles',
};

const country = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
};

export interface KindCandidate { kind: VehicleKind; source: DetailSource; at: string }
export interface CarDetails {
  kind?: { value: VehicleKind; source: DetailSource; note?: string };
  details: CarDetail[];
  /** No kind: why SAZO could not tell (for the admins' Kind needed list). */
  kindNeeded?: { reason: 'mixed_model' | 'unknown_model' | 'no_model'; kinds?: VehicleKind[] };
  /** Records name different kinds and no SAZO admin has settled it since (D-148: reviewed by an admin). */
  disagreement?: KindCandidate[];
  make?: string; model?: string; year?: number; origin?: DetailSource;
}

const kindOf = (o: StoredObservation): VehicleKind | undefined => {
  const v = o.type === 'inspection_result' ? o.attributes.observedKind : o.type === 'spec_declared' ? o.attributes.kind ?? kindFromText(o.attributes.body as string | undefined) : undefined;
  return isVehicleKind(v) ? v : undefined;
};

@Injectable()
export class CarDetailsService {
  constructor(
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(TrustService) private readonly trust: TrustService,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(FuelService) private readonly fuel: FuelService,
  ) {}

  async forVehicle(vehicleId: string): Promise<CarDetails> {
    const family = await this.registry.mergeFamily(vehicleId);
    const [snap, obs, decision, ids, owners] = await Promise.all([
      this.trust.current(vehicleId), this.observations.listForVehicles(family), this.registry.kindDecision(family),
      this.registry.presentableIdentifiers(vehicleId), this.fuel.ownersAverage(family),
    ]);
    const facts = snap?.facts ?? {};
    const byId = new Map(obs.map((o) => [o.id, o]));
    const sourceOf = (key: string): DetailSource => CLASS_SOURCE[byId.get(facts[key]?.supporting[0] ?? '')?.evidenceClass ?? ''] ?? 'record';
    const make = facts.make?.value as string | undefined, model = facts.model?.value as string | undefined;
    const ident = this.reference.identify({ make, model, chassis: ids.chassisNumber });
    const spec = ident.spec;
    const out: CarDetails = { details: [], ...(make ? { make } : {}), ...(model ? { model } : {}),
      ...(typeof facts.year?.value === 'number' ? { year: facts.year.value } : {}) };
    const firstObs = [...obs].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
    if (firstObs) out.origin = CLASS_SOURCE[firstObs.evidenceClass] ?? 'record';

    // The kind of car.
    const candidates: KindCandidate[] = obs.flatMap((o) => {
      const k = kindOf(o);
      return k ? [{ kind: k, source: CLASS_SOURCE[o.evidenceClass] ?? 'record', at: o.recordedAt }] : [];
    });
    const factKind = facts.kind?.value;
    const inspected = candidates.filter((c) => c.source === 'inspector');
    if (decision && isVehicleKind(decision.kind)) {
      out.kind = { value: decision.kind, source: 'admin' };
    } else if (isVehicleKind(factKind)) {
      const src = sourceOf('kind');
      out.kind = { value: factKind, source: src, ...(src !== 'inspector' && inspected.some((c) => c.kind === factKind) ? { note: 'confirmed by an inspector' } : {}) };
    } else if (ident.kind) {
      out.kind = { value: ident.kind, source: ident.via, ...(inspected.some((c) => c.kind === ident.kind) ? { note: 'confirmed by an inspector' } : {}) };
    } else {
      out.kindNeeded = { reason: ident.reason, ...(ident.kinds ? { kinds: ident.kinds } : {}) };
    }
    const kinds = new Set(candidates.map((c) => c.kind));
    if (kinds.size > 1) {
      const since = decision ? candidates.filter((c) => c.at > decision.decidedAt && c.kind !== decision.kind) : candidates;
      if (since.length) out.disagreement = candidates;
    }

    // The other details: a record first, then the maker's figure from SAZO's model list.
    const details: CarDetail[] = [];
    if (out.kind) details.push({ key: 'kind', value: out.kind.value, source: out.kind.source, ...(out.kind.note ? { note: out.kind.note } : {}) });
    for (const key of CAR_DETAIL_KEYS) {
      if (key === 'kind') continue;
      const f = FACTS[key] ? facts[FACTS[key]!] : undefined;
      if (f && f.value !== undefined && f.value !== null) { details.push({ key, value: f.value as string | number, source: sourceOf(FACTS[key]!) }); continue; }
      const s = SPEC[key] && spec ? spec[SPEC[key]!] : null;
      if (s !== null && s !== undefined) { details.push({ key, value: s as string | number, source: spec!.basis === 'maker' ? 'maker' : 'maker_test' }); continue; }
      if (key === 'actualKmPerL' && owners) details.push({ key, value: owners.kmPerL, source: 'owners', note: `from ${owners.tanks} measured tanks` });
      if (key === 'firstRegisteredYear' && typeof facts.first_registration_date?.value === 'string') {
        details.push({ key, value: Number(String(facts.first_registration_date.value).slice(0, 4)), source: 'record' });
      }
      if (key === 'importedFrom' && typeof facts.import_origin?.value === 'string') details.push({ key, value: country(facts.import_origin.value), source: 'record' });
    }
    out.details = details;
    return out;
  }

  /** The admins' list (D-148): cars SAZO could not give a kind, and cars whose records disagree. */
  async queue(limit = 1000) {
    const ids = (await this.registry.liveVehicleIds()).slice(0, limit);
    const needed: { vehicleRef: string; plate?: string; make?: string; model?: string; year?: number; reason: string; kinds?: VehicleKind[]; origin?: DetailSource }[] = [];
    const disagree: { vehicleRef: string; plate?: string; make?: string; model?: string; year?: number; current?: VehicleKind; candidates: KindCandidate[] }[] = [];
    for (const id of ids) {
      const [card, d] = await Promise.all([this.registry.card(id), this.forVehicle(id).catch(() => undefined)]);
      if (!card || !d) continue;
      const base = { vehicleRef: card.vehicleRef, ...(card.currentPlate ? { plate: card.currentPlate } : {}), ...(d.make ? { make: d.make } : {}),
        ...(d.model ? { model: d.model } : {}), ...(d.year ? { year: d.year } : {}) };
      if (d.kindNeeded) needed.push({ ...base, reason: d.kindNeeded.reason, ...(d.kindNeeded.kinds ? { kinds: d.kindNeeded.kinds } : {}), ...(d.origin ? { origin: d.origin } : {}) });
      if (d.disagreement) disagree.push({ ...base, ...(d.kind ? { current: d.kind.value } : {}), candidates: d.disagreement });
    }
    return { needed, disagree };
  }
}
