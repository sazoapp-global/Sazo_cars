// Dealer workspace (P-005) growing into the dealership system (D-120). A dealer keeps the cars it is selling:
// a car can be added before its chassis number is known (D-125, step 1), and joins the car's SAZO history once
// linked. Listings and sales go through Ingestion on the dealer's own source. Sale prices and costs stay
// confidential. Each car has an import stage, two clocks (days in stock and the customs bond deadline, D-124),
// photos, and an append-only cost ledger kept in the original currency.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PARAMS } from '@sazo/trust-engine';
import { IamService, type Actor } from '../iam/index.js';
import { IngestionError, IngestionService } from '../ingest/index.js';
import { EvidenceService } from '../obs/index.js';
import { ReportsService } from '../report/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { DealerRepository, type CostCategory, type CostRow, type DealerSettings, type StockDetails, type StockRow, type StockStatus } from './dealer.repository.js';

export type DealerErrorCode = 'stock_not_found' | 'vehicle_not_found' | 'identifiers_required' | 'odometer_photo_required' | 'too_many_listings' | 'already_in_stock'
  | 'waiting_for_review' | 'listing_rejected' | 'not_in_stock' | 'organisation_not_approved' | 'already_linked' | 'link_first' | 'costs_locked'
  | 'cost_not_found' | 'already_reversed' | 'photo_not_allowed' | 'too_many_photos' | 'photo_not_found' | 'commission_incomplete' | 'make_required' | 'rate_required'
  | 'import_empty' | 'import_too_big' | 'import_already_added' | 'import_not_found';

export class DealerError extends Error {
  constructor(readonly code: DealerErrorCode, message: string, readonly details: unknown[] = []) {
    super(message);
  }
}

export interface AddStock {
  vehicleRef?: string; plate?: string; vin?: string; chassisNumber?: string; askingPriceUgx: number; mileageKm?: number; odometerPhotoId?: string; notes?: string;
  details?: Partial<StockDetails>;
}
export interface LinkStock { vin?: string; chassisNumber?: string; plate?: string; vehicleRef?: string; mileageKm?: number; odometerPhotoId?: string }
/** New listings a dealer can add per day (Security S3: stops one dealer flooding many cars' histories; 200 since D-131). */
export const DAILY_LISTINGS = 200;
export const MAX_PHOTOS = 12;
/** A customs deadline this close counts as "soon" (amber). */
export const BOND_SOON_DAYS = 30;

const sourceCodeFor = (organisationId: string) => `DLR-${organisationId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const money = (amount: number) => ({ amount, currency: 'UGX' as const });
const DAY = 86_400_000;
const daysBetween = (from: string | Date, to = new Date()) => Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.parse(typeof from === 'string' ? from.slice(0, 10) : from.toISOString().slice(0, 10))) / DAY);

/** Which commercial alert level a car has passed (0 = none), from the dealer's thresholds (D-124). */
export function stockAgeLevel(days: number, thresholds: number[]): number {
  return [...thresholds].sort((a, b) => a - b).filter((t) => days >= t).length;
}

/** The customs bond clock: the extension wins over the original deadline; nothing is assumed when no deadline was entered. */
export function bondClock(r: Pick<StockDetails, 'stage' | 'bondArrivedOn' | 'customsStatus' | 'customsDeadline' | 'customsExtensionUntil'>, today = new Date()) {
  const deadline = r.customsExtensionUntil ?? r.customsDeadline;
  const inBond = r.stage === 'in_bond' || r.customsStatus === 'in_bond' || r.customsStatus === 'assessed';
  const daysInBond = r.bondArrivedOn && inBond ? Math.max(0, daysBetween(r.bondArrivedOn, today)) : null;
  if (!deadline || !inBond) return { applies: inBond, deadline, daysInBond, daysLeft: null, level: 'none' as const };
  const daysLeft = -daysBetween(deadline, today);
  return { applies: true, deadline, daysInBond, daysLeft, level: daysLeft < 0 ? ('overdue' as const) : daysLeft <= BOND_SOON_DAYS ? ('soon' as const) : ('ok' as const) };
}

@Injectable()
export class DealerService {
  constructor(
    @Inject(DealerRepository) private readonly repo: DealerRepository,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
  ) {}

  private async ensureSource(organisationId: string): Promise<string> {
    const code = sourceCodeFor(organisationId);
    if (!(await this.ingestion.sourceByCode(code))) {
      const org = await this.iam.organisation(organisationId);
      await this.ingestion.upsertSource({
        code, name: org?.tradingName ?? org?.legalName ?? code, organisationId, domain: 'dealer', channel: 'partner_portal', isSimulated: false,
        evidenceClass: 'dealer', baselineReputation: PARAMS.baseline.dealer, coverage: [{ scope: 'own_stock', from: new Date().toISOString().slice(0, 10) }],
      });
    }
    return code;
  }

  /** How the car is presented to Ingestion: its anchor and plate when known, otherwise what the dealer typed. */
  private async identifiers(input: Pick<AddStock, 'vehicleRef' | 'plate' | 'vin' | 'chassisNumber'>): Promise<{ vehicleId?: string; ids: Record<string, string> }> {
    if (input.vehicleRef) {
      const vehicleId = await this.registry.idForRef(input.vehicleRef);
      if (!vehicleId) throw new DealerError('vehicle_not_found', 'No such vehicle');
      const idents = (await this.registry.identifiers(vehicleId)).filter((i) => i.status === 'active');
      const vin = idents.find((i) => i.type === 'vin');
      const chassis = idents.find((i) => i.type === 'chassis_number');
      const plate = idents.find((i) => i.type === 'registration_plate');
      return { vehicleId, ids: { ...(vin ? { vin: vin.valueRaw } : chassis ? { chassisNumber: chassis.valueRaw } : {}), ...(plate ? { plate: plate.valueRaw } : {}) } };
    }
    if (!input.vin && !input.chassisNumber && !input.plate) throw new DealerError('identifiers_required', 'Enter the number plate or the chassis number');
    return { ids: { ...(input.vin ? { vin: input.vin } : input.chassisNumber ? { chassisNumber: input.chassisNumber } : {}), ...(input.plate ? { plate: input.plate } : {}) } };
  }

  private async send(userId: string, organisationId: string, ids: Record<string, string>, records: { type: string; attributes: Record<string, unknown>; evidenceIds?: string[] }[], at = new Date().toISOString()) {
    const source = await this.ensureSource(organisationId);
    try {
      const res = await this.ingestion.submit(source, { schemaVersion: 1, items: [{ identifiers: ids, records: records.map((r) => ({ ...r, time: { at, precision: 'day' as const } })) }] },
        { idempotencyKey: randomUUID(), userId, organisationId });
      return Object.assign(res.items[0]!, { submissionId: res.submissionId });
    } catch (err) {
      if (err instanceof IngestionError && err.code === 'organisation_not_approved') throw new DealerError('organisation_not_approved', err.message);
      throw err;
    }
  }

  /** Security S3: a mileage from a dealer needs a photo of the odometer taken by someone at this dealer, like a garage's. */
  private async checkOdometer(organisationId: string, mileageKm: number | undefined, photoId: string | undefined) {
    if (mileageKm === undefined) return;
    const [photo] = photoId ? await this.evidence.view([photoId]) : [];
    if (!photo || photo.kind !== 'odometer_photo' || !photo.uploadedBy || !(await this.iam.isActiveMember(photo.uploadedBy, organisationId))) {
      throw new DealerError('odometer_photo_required', 'Add a photo of the odometer with the mileage');
    }
  }

  /**
   * Publish the listing (and mileage) to the car's history and return its SAZO vehicle. A car SAZO knew nothing
   * about is added to SAZO here (D-130: never refused; provisional until an official record matches, P-010), with
   * the make, model and year the dealer typed as a dealer's declaration (lowest weight). When SAZO must first
   * check which car it is (S24), the listing waits for the reviewer: `pending` is returned instead of a vehicle.
   */
  private async publish(actor: Actor, organisationId: string, input: LinkStock, askingPriceUgx: number, details: Partial<StockDetails>): Promise<{ vehicleId?: string; pending?: string }> {
    const { vehicleId: known, ids } = await this.identifiers(input);
    if (known && (await this.repo.live(organisationId, known))) throw new DealerError('already_in_stock', 'This car is already in your stock');
    const records = [
      { type: 'listing_published', attributes: { askingPrice: money(askingPriceUgx) } },
      ...(input.mileageKm !== undefined ? [{ type: 'odometer_reading', evidenceIds: [input.odometerPhotoId!], attributes: { km: input.mileageKm, originalValue: input.mileageKm, originalUnit: 'km', method: 'dashboard' } }] : []),
    ];
    const item = await this.send(actor.userId, organisationId, ids, records);
    if (item.status === 'needs_review') return { pending: item.submissionId };
    if (item.status !== 'accepted' || !item.vehicleId) throw new DealerError('listing_rejected', 'SAZO could not accept this listing', item.errors);
    await this.declareSpec(actor.userId, organisationId, item.vehicleId, ids, details);
    return { vehicleId: item.vehicleId };
  }

  /** The make, model and year the dealer typed, for a car SAZO has no make for yet. */
  private async declareSpec(userId: string, organisationId: string, vehicleId: string, ids: Record<string, string>, details: Partial<StockDetails>) {
    if (!details.make) return;
    const v = await this.registry.getVehicle(vehicleId);
    const summary = v ? await this.reports.publicSummary(v.publicRef).catch(() => undefined) : undefined;
    if (summary?.vehicle?.make) return;
    const spec = { make: details.make, ...(details.model ? { model: details.model } : {}), ...(details.modelYear ? { year: details.modelYear } : {}),
      ...(details.engineCc ? { engineCc: details.engineCc } : {}), ...(details.fuel ? { fuel: details.fuel } : {}), ...(details.transmission ? { transmission: details.transmission } : {}) };
    const sendIds = v ? (await this.identifiers({ vehicleRef: v.publicRef })).ids : ids;
    await this.send(userId, organisationId, sendIds, [{ type: 'spec_declared', attributes: spec }]).catch(() => undefined);
  }

  /**
   * Cars waiting for SAZO's reviewer (D-130): once the reviewer has matched the listing to a SAZO vehicle, the car
   * is linked by itself; if the reviewer turned it down, it stays in stock unlinked and the dealer can add the
   * chassis number again. Runs whenever the dealer looks at their stock.
   */
  async syncPending(organisationId: string): Promise<void> {
    for (const r of await this.repo.pending(organisationId)) {
      const sub = await this.ingestion.get(r.pendingSubmissionId!);
      const item = sub?.items[0];
      if (!item || item.status === 'needs_review' || item.status === 'pending') continue;
      if (item.status !== 'accepted' || !item.vehicleId || (await this.repo.live(organisationId, item.vehicleId))) {
        await this.repo.setPending(r.id, null);
        continue;
      }
      if (!(await this.repo.link(r.id, item.vehicleId, null))) continue;
      await this.declareSpec(r.createdBy, organisationId, item.vehicleId, {}, r);
      await this.iam.audit({ actor: { userId: r.createdBy } as Actor, organisationId, action: 'dealer.car_linked', targetType: 'dealer_stock', targetId: r.id, details: { afterReview: true } });
    }
  }

  async add(actor: Actor, organisationId: string, input: AddStock): Promise<StockRow> {
    if ((await this.repo.listedToday(organisationId)) >= DAILY_LISTINGS) throw new DealerError('too_many_listings', `A dealer can add up to ${DAILY_LISTINGS} cars a day. Call SAZO if you need more.`);
    const details = input.details ?? {};
    const hasIds = !!(input.vehicleRef || input.vin || input.chassisNumber || input.plate);
    if (!hasIds && !details.make) throw new DealerError('make_required', 'Enter the make and model, or the number plate or chassis number');
    if (!hasIds && input.mileageKm !== undefined) throw new DealerError('link_first', 'Add the mileage with the number plate or chassis number');
    await this.checkOdometer(organisationId, input.mileageKm, input.odometerPhotoId);
    const published = hasIds ? await this.publish(actor, organisationId, input, input.askingPriceUgx, details) : {};
    const row = await this.repo.insert({ organisationId, vehicleId: published.vehicleId ?? null, pendingSubmissionId: published.pending ?? null, askingPriceUgx: input.askingPriceUgx,
      listedMileageKm: input.mileageKm ?? null, notes: input.notes ?? null, createdBy: actor.userId,
      details: { ...details, receivedOn: details.receivedOn ?? new Date().toISOString().slice(0, 10) } });
    if (!row) throw new DealerError('already_in_stock', 'This car is already in your stock');
    await this.iam.audit({ actor, organisationId, action: 'dealer.car_added', targetType: 'dealer_stock', targetId: row.id, details: { linked: !!published.vehicleId, waitingForReview: !!published.pending } });
    return row;
  }

  /** Step 2 for a car added without its plate or chassis number: link it to its SAZO vehicle, which publishes the listing. */
  async link(actor: Actor, organisationId: string, id: string, input: LinkStock): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    if (r.vehicleId) throw new DealerError('already_linked', 'This car is already linked to its SAZO record');
    if (r.pendingSubmissionId) throw new DealerError('waiting_for_review', 'SAZO is checking which car this is. It will be linked by itself once that is done.');
    await this.checkOdometer(organisationId, input.mileageKm, input.odometerPhotoId);
    const published = await this.publish(actor, organisationId, input, r.askingPriceUgx, r);
    if (published.pending) {
      await this.repo.setPending(id, published.pending);
    } else {
      const ok = await this.repo.link(id, published.vehicleId!, input.mileageKm ?? null);
      if (ok === undefined) throw new DealerError('already_in_stock', 'This car is already in your stock');
    }
    await this.iam.audit({ actor, organisationId, action: 'dealer.car_linked', targetType: 'dealer_stock', targetId: id, details: { waitingForReview: !!published.pending } });
    return this.get(organisationId, id);
  }

  async get(organisationId: string, id: string): Promise<StockRow> {
    let r = await this.repo.get(id);
    if (r?.pendingSubmissionId && r.organisationId === organisationId) {
      await this.syncPending(organisationId).catch(() => undefined);
      r = await this.repo.get(id);
    }
    if (!r || r.organisationId !== organisationId) throw new DealerError('stock_not_found', 'No such car in your stock');
    return r;
  }

  /** A new asking price is a new listing record (prices are history too). A car not yet linked just changes its price. */
  async changePrice(actor: Actor, organisationId: string, id: string, price: number): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    if (r.vehicleId) {
      const { ids } = await this.identifiersOf(r);
      const item = await this.send(actor.userId, organisationId, ids, [{ type: 'listing_published', attributes: { askingPrice: money(price) } }]);
      if (item.status !== 'accepted') throw new DealerError('listing_rejected', 'SAZO could not accept this price', item.errors);
    }
    await this.repo.setPrice(id, price);
    return this.get(organisationId, id);
  }

  /**
   * Change a car's typed details, stage, clocks, broker switch or commission. The commission and the customs
   * value are for managers (`canManage`). Every change is in the audit log with what it was before.
   */
  async updateDetails(actor: Actor, organisationId: string, id: string, patch: Partial<StockDetails>, canManage: boolean): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    const p = { ...patch };
    if (!canManage) { delete p.commissionKind; delete p.commissionFixedUgx; delete p.commissionPercent; delete p.customsValueUgx; }
    if (p.commissionKind !== undefined || p.commissionFixedUgx !== undefined || p.commissionPercent !== undefined) {
      const kind = p.commissionKind !== undefined ? p.commissionKind : r.commissionKind;
      if (kind === 'fixed') { p.commissionFixedUgx = p.commissionFixedUgx ?? r.commissionFixedUgx; p.commissionPercent = null; if (!p.commissionFixedUgx) throw new DealerError('commission_incomplete', 'Enter the commission amount in UGX'); }
      else if (kind === 'percent') { p.commissionPercent = p.commissionPercent ?? r.commissionPercent; p.commissionFixedUgx = null; if (!p.commissionPercent) throw new DealerError('commission_incomplete', 'Enter the commission as a percentage of the selling price'); }
      else { p.commissionKind = null; p.commissionFixedUgx = null; p.commissionPercent = null; }
    }
    if (p.make === null && !r.vehicleId) throw new DealerError('make_required', 'A car not yet linked to SAZO needs its make');
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(p) as (keyof StockDetails)[]) before[k] = r[k];
    if (!(await this.repo.updateDetails(id, p))) throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    await this.iam.audit({ actor, organisationId, action: 'dealer.car_updated', targetType: 'dealer_stock', targetId: id, details: { before, after: p } });
    return this.get(organisationId, id);
  }

  async markSold(actor: Actor, organisationId: string, id: string, price: number, soldOn: string): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    const at = `${soldOn}T12:00:00Z`;
    if (r.vehicleId) {
      const { ids } = await this.identifiersOf(r);
      const item = await this.send(actor.userId, organisationId, ids, [{ type: 'sale_recorded', attributes: { price: money(price) } }], at);
      if (item.status !== 'accepted') throw new DealerError('listing_rejected', 'SAZO could not record the sale', item.errors);
    }
    if (!(await this.repo.markSold(id, price, at))) throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    await this.iam.audit({ actor, organisationId, action: 'dealer.car_sold', targetType: 'dealer_stock', targetId: id });
    return this.get(organisationId, id);
  }

  async remove(organisationId: string, id: string): Promise<void> {
    const r = await this.get(organisationId, id);
    if (!(await this.repo.remove(r.id))) throw new DealerError('not_in_stock', 'This car is no longer in your stock');
  }

  private async identifiersOf(r: StockRow) {
    const v = await this.registry.getVehicle(r.vehicleId!);
    return this.identifiers({ vehicleRef: v!.publicRef });
  }

  async list(organisationId: string, status?: StockStatus) {
    await this.syncPending(organisationId).catch(() => undefined);
    return this.repo.list(organisationId, status);
  }

  // Costs (managers) -------------------------------------------------------------------------------------

  async costs(organisationId: string, id: string): Promise<{ entries: CostRow[]; totalUgx: number }> {
    await this.get(organisationId, id);
    const entries = await this.repo.costs(id);
    return { entries, totalUgx: entries.reduce((n, e) => n + (e.reversesEntryId ? -e.amountUgx : e.amountUgx), 0) };
  }

  /** A cost in its own currency with the rate used. Costs are frozen once the car is sold (so a commission or margin cannot be moved afterwards). */
  async addCost(actor: Actor, organisationId: string, id: string, c: { category: CostCategory; amount: number; currency: string; rateToUgx?: number; note?: string; shareRule?: string }): Promise<CostRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('costs_locked', 'Costs can no longer change once a car is sold or removed');
    const rate = c.currency === 'UGX' ? 1 : c.rateToUgx;
    if (!rate) throw new DealerError('rate_required', 'Enter the exchange rate to UGX');
    const row = await this.repo.addCost({ organisationId, stockItemId: id, category: c.category, amount: c.amount, currency: c.currency, rateToUgx: rate,
      amountUgx: Math.round(c.amount * rate), note: c.note ?? null, shareRule: c.shareRule ?? null, reversesEntryId: null, createdBy: actor.userId });
    await this.iam.audit({ actor, organisationId, action: 'dealer.cost_added', targetType: 'dealer_stock', targetId: id, details: { entryId: row!.id, category: c.category } });
    return row!;
  }

  /** A correction: a reversal entry that cancels one cost. The original stays in the ledger. */
  async reverseCost(actor: Actor, organisationId: string, id: string, entryId: string, reason: string): Promise<CostRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('costs_locked', 'Costs can no longer change once a car is sold or removed');
    const e = (await this.repo.costs(id)).find((x) => x.id === entryId);
    if (!e || e.reversesEntryId) throw new DealerError('cost_not_found', 'No such cost on this car');
    if (e.reversedBy) throw new DealerError('already_reversed', 'This cost has already been reversed');
    const row = await this.repo.addCost({ organisationId, stockItemId: id, category: e.category, amount: e.amount, currency: e.currency, rateToUgx: e.rateToUgx,
      amountUgx: e.amountUgx, note: reason, shareRule: null, reversesEntryId: e.id, createdBy: actor.userId });
    if (!row) throw new DealerError('already_reversed', 'This cost has already been reversed');
    await this.iam.audit({ actor, organisationId, action: 'dealer.cost_reversed', targetType: 'dealer_stock', targetId: id, details: { entryId, reason } });
    return row;
  }

  // Photos -----------------------------------------------------------------------------------------------

  /** A car photo must be a vehicle photo taken by someone at this dealer (the same rule as odometer photos). */
  async addPhoto(actor: Actor, organisationId: string, id: string, evidenceId: string) {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    const [f] = await this.evidence.view([evidenceId]);
    if (!f || f.kind !== 'vehicle_photo' || !f.uploadedBy || !(await this.iam.isActiveMember(f.uploadedBy, organisationId))) {
      throw new DealerError('photo_not_allowed', 'Use a car photo taken by someone at your business');
    }
    if ((await this.repo.photoCount(id)) >= MAX_PHOTOS) throw new DealerError('too_many_photos', `A car can have up to ${MAX_PHOTOS} photos`);
    const p = await this.repo.addPhoto({ organisationId, stockItemId: id, evidenceId, addedBy: actor.userId });
    if (!p) throw new DealerError('photo_not_allowed', 'This photo is already on the car');
    return p;
  }

  async removePhoto(organisationId: string, id: string, photoId: string) {
    await this.get(organisationId, id);
    if (!(await this.repo.removePhoto(id, photoId))) throw new DealerError('photo_not_found', 'No such photo');
  }

  /** The image bytes for one of a car's photos, checked again at the moment it is served. */
  async photoContent(stockItemId: string, photoId: string) {
    const photo = (await this.repo.photos([stockItemId])).get(stockItemId)?.find((p) => p.id === photoId);
    if (!photo) return undefined;
    const [f] = await this.evidence.view([photo.evidenceId]);
    if (!f || f.kind !== 'vehicle_photo') return undefined;
    const c = await this.evidence.content(photo.evidenceId);
    return c && c.mime.startsWith('image/') ? c : undefined;
  }

  // Settings ---------------------------------------------------------------------------------------------

  settings(organisationId: string): Promise<DealerSettings> {
    return this.repo.settings(organisationId);
  }

  async saveSettings(actor: Actor, organisationId: string, s: DealerSettings): Promise<DealerSettings> {
    const before = await this.repo.settings(organisationId);
    const clean = { stockAgeAlertDays: [...new Set(s.stockAgeAlertDays)].sort((a, b) => a - b), leadProtectionDays: s.leadProtectionDays, whatsappE164: s.whatsappE164 ?? null };
    await this.repo.saveSettings(organisationId, clean, actor.userId);
    await this.iam.audit({ actor, organisationId, action: 'dealer.settings_changed', targetType: 'organisation', targetId: organisationId, details: { before, after: clean } });
    return clean;
  }

  // Views ------------------------------------------------------------------------------------------------

  /**
   * Cars for sale (compare picker): what an approved dealer has in stock, with asking price and listed
   * mileage. Never the sale price, costs, notes or who listed it.
   */
  async forSale(limit = 60) {
    const rows = await this.repo.inStockEverywhere(limit * 2);
    const orgs = new Map<string, { name: string; approved: boolean }>();
    for (const id of new Set(rows.map((r) => r.organisationId))) {
      const o = await this.iam.organisation(id);
      orgs.set(id, { name: o?.tradingName ?? o?.legalName ?? '', approved: o?.status === 'approved' });
    }
    const out = [];
    for (const r of rows) {
      if (!orgs.get(r.organisationId)?.approved) continue;
      const v = await this.registry.getVehicle(r.vehicleId!);
      if (!v) continue;
      const summary = await this.reports.publicSummary(v.publicRef).catch(() => undefined);
      out.push({ vehicleRef: v.publicRef, vehicle: summary?.vehicle ?? null, askingPriceUgx: r.askingPriceUgx, listedMileageKm: r.listedMileageKm,
        dealerName: orgs.get(r.organisationId)!.name, listedAt: new Date(r.listedAt).toISOString() });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Views for the dealer's own list, with costs and margins only when `withCosts` (managers). */
  async views(rows: StockRow[], organisationId: string, withCosts: boolean) {
    const ids = rows.map((r) => r.id);
    const [settings, photos, totals] = await Promise.all([this.repo.settings(organisationId), this.repo.photos(ids), withCosts ? this.repo.costTotals(ids) : Promise.resolve(undefined)]);
    return Promise.all(rows.map((r) => this.view(r, { settings, photos: photos.get(r.id) ?? [], costTotalUgx: totals ? totals.get(r.id) ?? 0 : undefined })));
  }

  async view(r: StockRow, ctx?: { settings?: DealerSettings; photos?: { id: string; evidenceId: string; position: number; addedAt: Date }[]; costTotalUgx?: number }) {
    const v = r.vehicleId ? await this.registry.getVehicle(r.vehicleId) : undefined;
    const summary = v ? await this.reports.publicSummary(v.publicRef).catch(() => undefined) : undefined;
    const settings = ctx?.settings ?? (await this.repo.settings(r.organisationId));
    const photos = ctx?.photos ?? (await this.repo.photos([r.id])).get(r.id) ?? [];
    const daysInStock = Math.max(0, daysBetween(r.receivedOn ?? new Date(r.listedAt), r.soldAt ? new Date(r.soldAt) : new Date()));
    const cost = ctx?.costTotalUgx;
    return {
      stockId: r.id,
      vehicleRef: v?.publicRef,
      linked: !!r.vehicleId,
      waitingForReview: !r.vehicleId && !!r.pendingSubmissionId,
      status: r.status,
      askingPriceUgx: r.askingPriceUgx,
      listedMileageKm: r.listedMileageKm,
      notes: r.notes,
      listedAt: new Date(r.listedAt).toISOString(),
      soldAt: r.soldAt ? new Date(r.soldAt).toISOString() : null,
      salePriceUgx: r.salePriceUgx,
      details: {
        make: r.make, model: r.model, modelYear: r.modelYear, engineCc: r.engineCc, fuel: r.fuel, transmission: r.transmission, colour: r.colour, yard: r.yard,
        stage: r.stage, receivedOn: r.receivedOn, bondArrivedOn: r.bondArrivedOn, customsStatus: r.customsStatus, customsDeadline: r.customsDeadline,
        customsExtensionUntil: r.customsExtensionUntil, tiktokUrl: r.tiktokUrl, openToBrokers: r.openToBrokers,
        commissionKind: r.commissionKind, commissionFixedUgx: r.commissionFixedUgx, commissionPercent: r.commissionPercent,
        ...(cost !== undefined ? { customsValueUgx: r.customsValueUgx } : {}),
      },
      clocks: {
        daysInStock,
        stockAgeLevel: r.status === 'in_stock' ? stockAgeLevel(daysInStock, settings.stockAgeAlertDays) : 0,
        stockAgeAlertDays: settings.stockAgeAlertDays,
        bond: bondClock(r),
      },
      photos: photos.map((p) => ({ photoId: p.id, position: p.position })),
      ...(cost !== undefined ? { costTotalUgx: cost, marginUgx: r.salePriceUgx !== null ? r.salePriceUgx - cost : null } : {}),
      vehicle: summary?.vehicle ?? null,
      questions: summary?.questions ?? [],
      recordConfidence: summary?.recordConfidence ?? null,
    };
  }
}
