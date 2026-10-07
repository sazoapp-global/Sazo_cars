// Vehicle Registry — public interface of module 2 (Domain Model §2, API Outline §5).
import { Inject, Injectable } from '@nestjs/common';
import { classifyIdentifier, normalizeIdentifier, type IdentifierKind } from '@sazo/contracts';
import type { Sql } from '../../platform/sql.js';
import { VehicleRepository, type IdentifierMatch, type IdentifierType } from './vehicle.repository.js';

export interface VehicleCard {
  vehicleRef: string;
  status: 'active' | 'provisional' | 'retired';
  currentPlate?: string;
  matchedOn: 'vin' | 'chassis_number' | 'registration_plate' | 'previous_plate';
  banner?: { severity: 'serious' | 'attention'; headlineKey: string };
}

export interface SearchOutcome {
  outcome: 'found' | 'multiple' | 'not_found' | 'invalid';
  queryKind: 'vin' | 'chassis' | 'plate' | 'unknown';
  normalizedQuery: string;
  matches: VehicleCard[];
  suggestion: { query: string; match: VehicleCard } | null;
}

export interface PresentedIdentifiers {
  vin?: string;
  chassisNumber?: string;
  plate?: string;
  engineNumber?: string;
}

export interface Resolution {
  outcome: 'matched' | 'created_new' | 'created_provisional' | 'ambiguous' | 'rejected';
  vehicleId?: string;
  decisionId: string;
  candidates: string[];
  /** Identifiers created while resolving; linked to the item's first observation afterwards (provenance). */
  newIdentifierIds: string[];
  reason?: string;
}

/** Records that change a vehicle's identifiers, as stored by the Observations module. */
export interface IdentifierRecord {
  observationId: string;
  type: string;
  attributes: Record<string, unknown>;
  eventTime: string | null;
}

export interface IdentityAlert {
  check: 'cloned_plate_suspected' | 'identity_collision' | 'plate_vin_mismatch' | 'duplicate_suspected';
  observationIds: string[];
  relatedVehicleIds: string[];
}

const TYPES: Record<Exclude<IdentifierKind, 'unknown'>, string[]> = {
  vin: ['vin'],
  chassis: ['chassis_number'],
  plate: ['registration_plate'],
};

@Injectable()
export class VehicleRegistry {
  constructor(@Inject(VehicleRepository) private readonly repo: VehicleRepository) {}

  // ------------------------------------------------------------------ search

  /**
   * Search by VIN, chassis number or plate. Never silently picks one vehicle when several match
   * (cloned/re-issued plates → "multiple"), and suggests corrections for O/I typos (G9).
   */
  async search(query: string): Promise<SearchOutcome> {
    const c = classifyIdentifier(query);
    if (c.kind === 'unknown') {
      return { outcome: 'invalid', queryKind: 'unknown', normalizedQuery: c.normalized, matches: [], suggestion: null };
    }
    const matches = await this.cards(await this.repo.findByIdentifier(TYPES[c.kind], c.normalized));
    let suggestion: SearchOutcome['suggestion'] = null;
    if (!matches.length && c.suggestion) {
      const [first] = await this.cards(await this.repo.findByIdentifier(TYPES[c.kind], c.suggestion));
      if (first) suggestion = { query: c.suggestion, match: first };
    }
    return {
      outcome: matches.length === 0 ? 'not_found' : matches.length === 1 ? 'found' : 'multiple',
      queryKind: c.kind,
      normalizedQuery: c.normalized,
      matches,
      suggestion,
    };
  }

  async card(vehicleId: string): Promise<VehicleCard | undefined> {
    const v = await this.repo.getVehicle(vehicleId);
    if (!v || v.status === 'merged') return undefined;
    const idents = await this.repo.identifiers(vehicleId);
    const disputed = idents.some((i) => i.type === 'registration_plate' && i.status === 'disputed');
    const anchor = idents.find((i) => i.type === 'vin' || i.type === 'chassis_number');
    const card: VehicleCard = {
      vehicleRef: v.publicRef,
      status: v.status as VehicleCard['status'],
      matchedOn: anchor?.type === 'vin' ? 'vin' : anchor ? 'chassis_number' : 'registration_plate',
    };
    const plate = await this.repo.currentPlate(vehicleId);
    if (plate) card.currentPlate = plate;
    if (disputed) card.banner = { severity: 'serious', headlineKey: 'identity.serious.cloned_plate_suspected' };
    return card;
  }

  private async cards(rows: IdentifierMatch[]): Promise<VehicleCard[]> {
    const out: VehicleCard[] = [];
    for (const r of rows) {
      const card = await this.card(r.vehicleId);
      if (!card) continue;
      card.matchedOn = r.identifierType === 'registration_plate' && r.identifierStatus === 'historical'
        ? 'previous_plate'
        : (r.identifierType as VehicleCard['matchedOn']);
      out.push(card);
    }
    return out;
  }

  idForRef(ref: string): Promise<string | undefined> {
    return this.repo.idForRef(ref);
  }

  getVehicle(id: string) {
    return this.repo.getVehicle(id);
  }

  identifiers(id: string) {
    return this.repo.identifiers(id);
  }

  /** The latest identity decision for a submission item (ingestion status and review queue). */
  latestDecisionForItem(submissionItemId: string) {
    return this.repo.latestDecisionForItem(submissionItemId);
  }

  mergeFamily(id: string): Promise<string[]> {
    return this.repo.mergeFamily(id);
  }

  // ----------------------------------------------------------------- resolve

  /**
   * Match presented identifiers to one vehicle (Domain Model §2 identity rules):
   * 1. VIN/chassis is the anchor — an exact match wins.
   * 2. A plate already on a DIFFERENT vehicle is never silently moved: both copies become "disputed"
   *    and a cloned-plate alert is raised (the record still attaches to the anchor's vehicle).
   * 3. A new anchor whose plate belongs to an un-anchored (provisional) vehicle is "ambiguous" → reviewer.
   * 4. Plate only: one holder → matched; several → ambiguous; none → provisional vehicle.
   */
  async resolve(sql: Sql, presented: PresentedIdentifiers, ctx: { submissionItemId: string; submissionId: string; eventTime?: string | null }): Promise<Resolution> {
    const vin = presented.vin ? normalizeIdentifier(presented.vin) : undefined;
    const chassis = presented.chassisNumber ? normalizeIdentifier(presented.chassisNumber) : undefined;
    const plate = presented.plate ? normalizeIdentifier(presented.plate) : undefined;
    const record = (outcome: Resolution['outcome'], rule: string, vehicleId?: string, candidates: string[] = []) =>
      this.repo.insertDecision(sql, { submissionItemId: ctx.submissionItemId, presented, outcome, matchedVehicleId: vehicleId, candidates, rule });

    if (!vin && !chassis && !plate) {
      return { outcome: 'rejected', decisionId: await record('rejected', 'no_identifiers'), candidates: [], newIdentifierIds: [], reason: 'no_identifiers' };
    }

    // 1. Anchor match.
    const anchorType: IdentifierType | undefined = vin ? 'vin' : chassis ? 'chassis_number' : undefined;
    const anchorValue = vin ?? chassis;
    if (anchorType && anchorValue) {
      const owners = (await this.repo.findByIdentifier([anchorType], anchorValue, sql)).filter((m) => m.identifierStatus === 'active');
      if (owners.length === 1) {
        const vehicleId = owners[0]!.vehicleId;
        const newIds = plate ? await this.attachPlate(sql, vehicleId, presented.plate!, ctx.eventTime ?? null) : [];
        return { outcome: 'matched', vehicleId, decisionId: await record('matched', `anchor_${anchorType}`, vehicleId), candidates: [], newIdentifierIds: newIds };
      }
      // 3. New anchor, plate held by an un-anchored vehicle → a human decides (S24).
      if (plate) {
        const holders = await this.repo.plateHolders(plate, sql);
        const unanchored = holders.filter((h) => !h.hasAnchor);
        if (unanchored.length) {
          const candidates = [...new Set(unanchored.map((h) => h.vehicleId))];
          return { outcome: 'ambiguous', decisionId: await record('ambiguous', 'new_anchor_plate_on_provisional', undefined, candidates), candidates, newIdentifierIds: [] };
        }
      }
      const v = await this.repo.createVehicle(sql, 'active', ctx.submissionId);
      const newIds = [await this.repo.addIdentifier(sql, { vehicleId: v.id, type: anchorType, raw: (presented.vin ?? presented.chassisNumber)!, normalized: anchorValue })];
      if (plate) newIds.push(...(await this.attachPlate(sql, v.id, presented.plate!, ctx.eventTime ?? null)));
      return { outcome: 'created_new', vehicleId: v.id, decisionId: await record('created_new', `new_${anchorType}`, v.id), candidates: [], newIdentifierIds: newIds };
    }

    // 4. Plate only.
    const holders = await this.repo.plateHolders(plate!, sql);
    const ids = [...new Set(holders.map((h) => h.vehicleId))];
    if (ids.length === 1) {
      return { outcome: 'matched', vehicleId: ids[0], decisionId: await record('matched', 'plate_single_holder', ids[0]), candidates: [], newIdentifierIds: [] };
    }
    if (ids.length > 1) {
      return { outcome: 'ambiguous', decisionId: await record('ambiguous', 'plate_multiple_holders', undefined, ids), candidates: ids, newIdentifierIds: [] };
    }
    const v = await this.repo.createVehicle(sql, 'provisional', ctx.submissionId);
    const newIds = [await this.repo.addIdentifier(sql, { vehicleId: v.id, type: 'registration_plate', raw: presented.plate!, normalized: plate!, validFrom: ctx.eventTime ?? null })];
    return { outcome: 'created_provisional', vehicleId: v.id, decisionId: await record('created_provisional', 'plate_unknown', v.id), candidates: [], newIdentifierIds: newIds };
  }

  /**
   * A reviewer resolves an ambiguous decision (adds a new decision row; never edits the old one).
   * Matching to a provisional vehicle adds the presented anchor and makes it active (S24).
   */
  async decideAmbiguous(sql: Sql, decisionId: string, choice: { vehicleId?: string; createNew?: boolean }, reviewerId: string): Promise<Resolution> {
    const d = await this.repo.getDecision(decisionId, sql);
    if (!d || d.outcome !== 'ambiguous') throw new Error('decision is not ambiguous');
    const p = d.presented as PresentedIdentifiers;
    const base = { submissionItemId: d.submissionItemId, presented: p, decidedBy: reviewerId };
    if (choice.createNew) {
      const v = await this.repo.createVehicle(sql, 'active', null);
      const newIds: string[] = [];
      if (p.vin || p.chassisNumber) {
        newIds.push(await this.repo.addIdentifier(sql, { vehicleId: v.id, type: p.vin ? 'vin' : 'chassis_number', raw: (p.vin ?? p.chassisNumber)!, normalized: normalizeIdentifier((p.vin ?? p.chassisNumber)!) }));
      }
      if (p.plate) newIds.push(...(await this.attachPlate(sql, v.id, p.plate, null)));
      const id = await this.repo.insertDecision(sql, { ...base, outcome: 'created_new', matchedVehicleId: v.id, rule: 'reviewer_new_vehicle' });
      return { outcome: 'created_new', vehicleId: v.id, decisionId: id, candidates: [], newIdentifierIds: newIds };
    }
    const vehicleId = choice.vehicleId!;
    if (!d.candidates.includes(vehicleId)) throw new Error('vehicle is not one of the candidates');
    const newIds: string[] = [];
    if (p.vin || p.chassisNumber) {
      newIds.push(await this.repo.addIdentifier(sql, { vehicleId, type: p.vin ? 'vin' : 'chassis_number', raw: (p.vin ?? p.chassisNumber)!, normalized: normalizeIdentifier((p.vin ?? p.chassisNumber)!) }));
      await this.repo.setVehicleStatus(sql, vehicleId, 'active');
    }
    const id = await this.repo.insertDecision(sql, { ...base, outcome: 'matched', matchedVehicleId: vehicleId, rule: 'reviewer_match' });
    return { outcome: 'matched', vehicleId, decisionId: id, candidates: [], newIdentifierIds: newIds };
  }

  // ------------------------------------------------- identifier maintenance

  /**
   * Put a plate on a vehicle. If another vehicle already holds it, nothing is moved silently:
   * every copy becomes "disputed" (cloned-plate rule; official plate_changed records are handled separately).
   */
  private async attachPlate(sql: Sql, vehicleId: string, raw: string, validFrom: string | null, changeReason?: string): Promise<string[]> {
    const norm = normalizeIdentifier(raw);
    const holders = await this.repo.plateHolders(norm, sql);
    const mine = (await this.repo.identifiers(vehicleId, sql)).find((i) => i.type === 'registration_plate' && i.value === norm);
    const others = holders.filter((h) => h.vehicleId !== vehicleId);
    if (others.length) {
      for (const o of others) if (o.status !== 'disputed') await this.repo.setIdentifierStatus(sql, o.id, 'disputed');
      if (mine) {
        if (mine.status !== 'disputed') await this.repo.setIdentifierStatus(sql, mine.id, 'disputed');
        return [];
      }
      return [await this.repo.addIdentifier(sql, { vehicleId, type: 'registration_plate', raw, normalized: norm, status: 'disputed', validFrom })];
    }
    if (mine) {
      if (mine.status === 'historical') await this.repo.setIdentifierStatus(sql, mine.id, 'active', null, changeReason);
      return [];
    }
    return [await this.repo.addIdentifier(sql, { vehicleId, type: 'registration_plate', raw, normalized: norm, validFrom, changeReason: changeReason ?? null })];
  }

  /** Apply identity-changing records after they are stored (registration, plate change, engine number). */
  async applyIdentifierRecords(sql: Sql, vehicleId: string, records: IdentifierRecord[]): Promise<void> {
    for (const r of records) {
      if (r.type === 'registration_issued' && typeof r.attributes.plate === 'string') {
        const ids = await this.attachPlate(sql, vehicleId, r.attributes.plate, r.eventTime);
        await this.repo.linkProvenance(sql, ids, r.observationId);
        const existing = (await this.repo.identifiers(vehicleId, sql)).find((i) => i.type === 'registration_plate' && i.value === normalizeIdentifier(r.attributes.plate as string));
        if (existing) await this.repo.linkProvenance(sql, [existing.id], r.observationId);
      }
      if (r.type === 'plate_changed') {
        const oldNorm = normalizeIdentifier(String(r.attributes.oldPlate));
        const old = (await this.repo.identifiers(vehicleId, sql)).find((i) => i.type === 'registration_plate' && i.value === oldNorm);
        if (old) await this.repo.setIdentifierStatus(sql, old.id, 'historical', r.eventTime);
        const ids = await this.attachPlate(sql, vehicleId, String(r.attributes.newPlate), r.eventTime, String(r.attributes.reason));
        await this.repo.linkProvenance(sql, ids, r.observationId);
      }
      if (r.type === 'identifier_assigned') {
        const type = r.attributes.identifierType as IdentifierType;
        const norm = normalizeIdentifier(String(r.attributes.value));
        const have = (await this.repo.identifiers(vehicleId, sql)).some((i) => i.type === type && i.value === norm);
        if (!have) await this.repo.addIdentifier(sql, { vehicleId, type, raw: String(r.attributes.value), normalized: norm, sourceObservationId: r.observationId });
      }
      if (r.type === 'spec_declared' && typeof r.attributes.engineNumber === 'string') {
        const norm = normalizeIdentifier(r.attributes.engineNumber);
        const have = (await this.repo.identifiers(vehicleId, sql)).some((i) => i.type === 'engine_number' && i.value === norm);
        if (!have) await this.repo.addIdentifier(sql, { vehicleId, type: 'engine_number', raw: r.attributes.engineNumber, normalized: norm, sourceObservationId: r.observationId });
      }
    }
  }

  linkProvenance(sql: Sql, identifierIds: string[], observationId: string): Promise<void> {
    return this.repo.linkProvenance(sql, identifierIds, observationId);
  }

  /** Cross-vehicle identity findings for the trust engine (C4–C7). */
  async identityAlerts(vehicleId: string): Promise<IdentityAlert[]> {
    const alerts: IdentityAlert[] = [];
    for (const i of await this.repo.identifiers(vehicleId)) {
      if (i.type !== 'registration_plate' || i.status !== 'disputed') continue;
      const holders = await this.repo.plateHolders(i.value);
      alerts.push({
        check: 'cloned_plate_suspected',
        observationIds: i.sourceObservationId ? [i.sourceObservationId] : [],
        relatedVehicleIds: [...new Set(holders.map((h) => h.vehicleId).filter((v) => v !== vehicleId))],
      });
    }
    return alerts;
  }
}
