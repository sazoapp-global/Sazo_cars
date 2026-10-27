// The broker marketplace (D-121, D-126). An approved broker sees every car that approved dealers have opened
// to brokers (photos, the car, asking price, the commission offered, the SAZO summary), makes their own links,
// and sees their own enquiries and commissions. Never a dealer's costs, margins, customers, other brokers'
// leads or staff.
import { Inject, Injectable } from '@nestjs/common';
import { BrokerApplicationError, BrokersService, IamService, type Actor } from '../iam/index.js';
import { EvidenceService, maskPhone, PartiesService } from '../obs/index.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerService } from './dealer.service.js';
import { SellingRepository, type LinkChannel } from './selling.repository.js';
import { SellingError, SellingService } from './selling.service.js';

export class BrokerError extends Error {
  constructor(readonly code: 'id_photo_invalid' | 'car_not_open', message: string) {
    super(message);
  }
}

@Injectable()
export class BrokerService {
  constructor(
    @Inject(DealerRepository) private readonly stock: DealerRepository,
    @Inject(DealerService) private readonly dealer: DealerService,
    @Inject(SellingRepository) private readonly selling: SellingRepository,
    @Inject(SellingService) private readonly sales: SellingService,
    @Inject(BrokersService) private readonly brokers: BrokersService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(PartiesService) private readonly parties: PartiesService,
  ) {}

  /** Apply with a National ID number and a photo of the ID that the applicant uploaded themselves. */
  async apply(actor: Actor, nin: string, idPhotoEvidenceId: string) {
    const [f] = await this.evidence.view([idPhotoEvidenceId]);
    if (!f || f.kind !== 'official_document' || f.uploadedBy !== actor.userId) throw new BrokerError('id_photo_invalid', 'Upload a photo of your National ID');
    return this.brokers.apply(actor, nin, idPhotoEvidenceId);
  }

  /** A car a broker may see: open to brokers, with commission terms, linked to SAZO, in stock at an approved dealer. */
  private async openCar(stockId: string) {
    const car = await this.stock.get(stockId);
    const org = car ? await this.iam.organisation(car.organisationId) : undefined;
    if (!car || car.status !== 'in_stock' || !car.vehicleId || !car.openToBrokers || !car.commissionKind || org?.status !== 'approved' || org.type !== 'dealer') {
      throw new BrokerError('car_not_open', 'This car is not open to brokers');
    }
    return { car, org };
  }

  /** The marketplace: what brokers can share, newest first. */
  async cars(limit = 120) {
    const rows = await this.stock.inStockEverywhere(limit * 2, true);
    const orgs = new Map<string, { name: string; district: string | null; ok: boolean }>();
    for (const id of new Set(rows.map((r) => r.organisationId))) {
      const o = await this.iam.organisation(id);
      orgs.set(id, { name: o?.tradingName ?? o?.legalName ?? '', district: o?.district ?? null, ok: o?.status === 'approved' && o.type === 'dealer' });
    }
    const open = rows.filter((r) => orgs.get(r.organisationId)?.ok).slice(0, limit);
    const views = await Promise.all(open.map((r) => this.dealer.view(r)));
    return views.map((v, i) => {
      const r = open[i]!;
      const d = v.details;
      return {
        stockId: v.stockId, vehicleRef: v.vehicleRef, vehicle: v.vehicle,
        specs: { make: v.vehicle?.make ?? d.make, model: v.vehicle?.model ?? d.model, year: v.vehicle?.year ?? d.modelYear, engineCc: d.engineCc, fuel: d.fuel, transmission: d.transmission, kind: d.kind ?? null },
        askingPriceUgx: v.askingPriceUgx, listedMileageKm: v.listedMileageKm, photos: v.photos.map((p) => p.photoId),
        commission: d.commissionKind === 'fixed' ? { kind: 'fixed' as const, amountUgx: d.commissionFixedUgx } : { kind: 'percent' as const, percent: d.commissionPercent },
        dealer: { name: orgs.get(r.organisationId)!.name, district: orgs.get(r.organisationId)!.district },
        questions: v.questions, recordConfidence: v.recordConfidence, listedAt: v.listedAt,
      };
    });
  }

  async photo(stockId: string, photoId: string) {
    await this.openCar(stockId);
    return this.dealer.photoContent(stockId, photoId);
  }

  /** The broker's own link for a car. The page shows the broker as the seller; the dealer's name only if the dealer shows it on its own links. */
  async createLink(actor: Actor, stockId: string, channel: LinkChannel) {
    const { car } = await this.openCar(stockId);
    return this.sales.createLink(actor, car.organisationId, stockId, { channel, showDealerName: false, brokerUserId: actor.userId });
  }

  async links(actor: Actor) {
    const rows = await this.selling.brokerLinks(actor.userId);
    return Promise.all(rows.map(async (l) => {
      const car = await this.stock.get(l.stockItemId);
      const v = car ? (await this.dealer.view(car)).vehicle : null;
      return { linkId: l.id, channel: l.channel, createdAt: new Date(l.createdAt).toISOString(), stockId: l.stockItemId, live: car?.status === 'in_stock',
        car: v?.make ? [v.year, v.make, v.model].filter(Boolean).join(' ') : car ? [car.modelYear, car.make, car.model].filter(Boolean).join(' ') : null };
    }));
  }

  async revokeLink(actor: Actor, linkId: string) {
    const l = await this.selling.link(linkId);
    if (!l || l.brokerUserId !== actor.userId) throw new SellingError('link_not_found', 'No such link');
    await this.selling.revokeLink(linkId);
  }

  /** The broker's own enquiries: the customer they brought (phone partly hidden), the car, the stage and protection. */
  async enquiries(actor: Actor) {
    const rows = await this.selling.brokerLeads(actor.userId);
    return Promise.all(rows.map(async (r) => {
      const [person, car, org] = await Promise.all([this.parties.reveal(r.partyId), r.stockItemId ? this.stock.get(r.stockItemId) : undefined, this.iam.organisation(r.organisationId)]);
      const v = car ? (await this.dealer.view(car)).vehicle : null;
      return {
        leadId: r.id, stage: r.stage, createdAt: new Date(r.createdAt).toISOString(), dealer: org?.tradingName ?? org?.legalName ?? null,
        car: v?.make ? [v.year, v.make, v.model].filter(Boolean).join(' ') : car ? [car.modelYear, car.make, car.model].filter(Boolean).join(' ') : null,
        customer: { name: person?.name ?? null, phone: maskPhone(person?.phone) ?? null },
        protectedUntil: r.protectedUntil ? new Date(r.protectedUntil).toISOString() : null,
        waitingForDealerDecision: r.needsDecision, sharedWithAnotherBroker: !!r.splitBrokerUserId,
      };
    }));
  }

  /** The broker's statement: every commission with its status, and totals. */
  async commissions(actor: Actor) {
    const rows = await this.selling.commissions({ brokerUserId: actor.userId });
    const items = await Promise.all(rows.map(async (c) => {
      const [car, org] = await Promise.all([this.stock.get(c.stockItemId), this.iam.organisation(c.organisationId)]);
      const v = car ? (await this.dealer.view(car)).vehicle : null;
      return {
        commissionId: c.id, status: c.status, amountUgx: c.amountUgx, sharePercent: c.sharePercent, kind: c.kind, percent: c.percent,
        dealer: org?.tradingName ?? org?.legalName ?? null, car: v?.make ? [v.year, v.make, v.model].filter(Boolean).join(' ') : car?.make ?? null,
        paidReference: c.status === 'paid' ? c.paidReference : null, createdAt: new Date(c.createdAt).toISOString(), updatedAt: new Date(c.updatedAt).toISOString(),
      };
    }));
    const sum = (s: string[]) => items.filter((i) => s.includes(i.status)).reduce((n, i) => n + i.amountUgx, 0);
    return { items, totals: { waiting: sum(['on_hold', 'pending']), approved: sum(['approved']), paid: sum(['paid']) } };
  }
}

export { BrokerApplicationError };
