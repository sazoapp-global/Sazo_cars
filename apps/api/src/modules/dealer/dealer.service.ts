// Dealer workspace (P-005). A dealer keeps the cars it is selling: each listing (asking price, mileage when
// listed) and each sale is sent through Ingestion on the dealer's own source, so it joins the car's history.
// Sale prices stay confidential (never shown to buyers). Buyer links reuse report snapshots (D-042).
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PARAMS } from '@sazo/trust-engine';
import { IamService, type Actor } from '../iam/index.js';
import { IngestionError, IngestionService } from '../ingest/index.js';
import { EvidenceService } from '../obs/index.js';
import { ReportsService } from '../report/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { DealerRepository, type StockRow, type StockStatus } from './dealer.repository.js';

export class DealerError extends Error {
  constructor(
    readonly code: 'stock_not_found' | 'vehicle_not_found' | 'identifiers_required' | 'odometer_photo_required' | 'too_many_listings' | 'already_in_stock' | 'vehicle_needs_review' | 'listing_rejected' | 'not_in_stock' | 'organisation_not_approved',
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

export interface AddStock { vehicleRef?: string; plate?: string; vin?: string; chassisNumber?: string; askingPriceUgx: number; mileageKm?: number; odometerPhotoId?: string; notes?: string }
/** New listings a dealer can add per day (Security S3: stops one dealer flooding many cars' histories). */
export const DAILY_LISTINGS = 50;

const sourceCodeFor = (organisationId: string) => `DLR-${organisationId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const money = (amount: number) => ({ amount, currency: 'UGX' as const });

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
    if (!input.vin && !input.chassisNumber) throw new DealerError('identifiers_required', 'For a car SAZO does not know yet, give its VIN or chassis number (and plate if it has one)');
    return { ids: { ...(input.vin ? { vin: input.vin } : { chassisNumber: input.chassisNumber! }), ...(input.plate ? { plate: input.plate } : {}) } };
  }

  private async send(actor: Actor, organisationId: string, ids: Record<string, string>, records: { type: string; attributes: Record<string, unknown>; evidenceIds?: string[] }[], at = new Date().toISOString()) {
    const source = await this.ensureSource(organisationId);
    try {
      const res = await this.ingestion.submit(source, { schemaVersion: 1, items: [{ identifiers: ids, records: records.map((r) => ({ ...r, time: { at, precision: 'day' as const } })) }] },
        { idempotencyKey: randomUUID(), userId: actor.userId, organisationId });
      return res.items[0]!;
    } catch (err) {
      if (err instanceof IngestionError && err.code === 'organisation_not_approved') throw new DealerError('organisation_not_approved', err.message);
      throw err;
    }
  }

  async add(actor: Actor, organisationId: string, input: AddStock): Promise<StockRow> {
    if ((await this.repo.listedToday(organisationId)) >= DAILY_LISTINGS) throw new DealerError('too_many_listings', `A dealer can add up to ${DAILY_LISTINGS} cars a day. Call SAZO if you need more.`);
    // Security S3: a mileage from a dealer needs a photo of the odometer taken by someone at this dealer, like a garage's.
    if (input.mileageKm !== undefined) {
      const [photo] = input.odometerPhotoId ? await this.evidence.view([input.odometerPhotoId]) : [];
      if (!photo || photo.kind !== 'odometer_photo' || !photo.uploadedBy || !(await this.iam.isActiveMember(photo.uploadedBy, organisationId))) {
        throw new DealerError('odometer_photo_required', 'Add a photo of the odometer with the mileage');
      }
    }
    const { vehicleId: known, ids } = await this.identifiers(input);
    if (known && (await this.repo.live(organisationId, known))) throw new DealerError('already_in_stock', 'This car is already in your stock');
    const records = [
      { type: 'listing_published', attributes: { askingPrice: money(input.askingPriceUgx) } },
      ...(input.mileageKm !== undefined ? [{ type: 'odometer_reading', evidenceIds: [input.odometerPhotoId!], attributes: { km: input.mileageKm, originalValue: input.mileageKm, originalUnit: 'km', method: 'dashboard' } }] : []),
    ];
    const item = await this.send(actor, organisationId, ids, records);
    if (item.status === 'needs_review') throw new DealerError('vehicle_needs_review', 'SAZO needs to check which car this is. It will appear in the car’s history once a reviewer has matched it; add it to your stock then.');
    if (item.status !== 'accepted' || !item.vehicleId) throw new DealerError('listing_rejected', 'SAZO could not accept this listing', item.errors);
    const row = await this.repo.insert({ organisationId, vehicleId: item.vehicleId, askingPriceUgx: input.askingPriceUgx, listedMileageKm: input.mileageKm ?? null, notes: input.notes ?? null, createdBy: actor.userId });
    if (!row) throw new DealerError('already_in_stock', 'This car is already in your stock');
    return row;
  }

  async get(organisationId: string, id: string): Promise<StockRow> {
    const r = await this.repo.get(id);
    if (!r || r.organisationId !== organisationId) throw new DealerError('stock_not_found', 'No such car in your stock');
    return r;
  }

  /** A new asking price is a new listing record (prices are history too). */
  async changePrice(actor: Actor, organisationId: string, id: string, price: number): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    const { ids } = await this.identifiersOf(r);
    const item = await this.send(actor, organisationId, ids, [{ type: 'listing_published', attributes: { askingPrice: money(price) } }]);
    if (item.status !== 'accepted') throw new DealerError('listing_rejected', 'SAZO could not accept this price', item.errors);
    await this.repo.setPrice(id, price);
    return this.get(organisationId, id);
  }

  async markSold(actor: Actor, organisationId: string, id: string, price: number, soldOn: string): Promise<StockRow> {
    const r = await this.get(organisationId, id);
    if (r.status !== 'in_stock') throw new DealerError('not_in_stock', 'This car is no longer in your stock');
    const { ids } = await this.identifiersOf(r);
    const at = `${soldOn}T12:00:00Z`;
    const item = await this.send(actor, organisationId, ids, [{ type: 'sale_recorded', attributes: { price: money(price) } }], at);
    if (item.status !== 'accepted') throw new DealerError('listing_rejected', 'SAZO could not record the sale', item.errors);
    await this.repo.markSold(id, price, at);
    return this.get(organisationId, id);
  }

  async remove(organisationId: string, id: string): Promise<void> {
    const r = await this.get(organisationId, id);
    if (!(await this.repo.remove(r.id))) throw new DealerError('not_in_stock', 'This car is no longer in your stock');
  }

  private async identifiersOf(r: StockRow) {
    const v = await this.registry.getVehicle(r.vehicleId);
    return this.identifiers({ vehicleRef: v!.publicRef });
  }

  list(organisationId: string, status?: StockStatus) {
    return this.repo.list(organisationId, status);
  }

  /** What the dealer sees for one car: its listing, its sale (theirs), and today's answers about the car. */
  async view(r: StockRow) {
    const v = await this.registry.getVehicle(r.vehicleId);
    const summary = v ? await this.reports.publicSummary(v.publicRef).catch(() => undefined) : undefined;
    return {
      stockId: r.id,
      vehicleRef: v?.publicRef,
      status: r.status,
      askingPriceUgx: r.askingPriceUgx,
      listedMileageKm: r.listedMileageKm,
      notes: r.notes,
      listedAt: new Date(r.listedAt).toISOString(),
      soldAt: r.soldAt ? new Date(r.soldAt).toISOString() : null,
      salePriceUgx: r.salePriceUgx,
      vehicle: summary?.vehicle ?? null,
      questions: summary?.questions ?? [],
      recordConfidence: summary?.recordConfidence ?? null,
    };
  }
}
