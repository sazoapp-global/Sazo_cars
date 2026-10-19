// Dealership selling (D-125 step 2). A dealer makes a link for a car and shares it on WhatsApp, TikTok or
// Facebook; the link opens a public car page with the car's SAZO summary and an enquiry form. Enquiries
// (from that page or added by staff) move through the sale stages to completed, which records the sale.
// Customers' names and phones go to the encrypted personal-data store; only the dealer's staff see them,
// and they never appear in any report (P-007).
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { enforceLimit, LimitReached } from '../../platform/limits.js';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { PartiesService } from '../obs/index.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerError, DealerService } from './dealer.service.js';
import { OPEN_STAGES, SellingRepository, type LeadRow, type LeadSource, type LeadStage, type LinkChannel, type LinkRow } from './selling.repository.js';

export type SellingErrorCode = 'link_not_found' | 'car_not_available' | 'car_not_linked' | 'lead_not_found' | 'stage_conflict' | 'sale_price_required'
  | 'lead_closed' | 'consent_required' | 'too_many' | 'stock_not_found' | 'no_decision_needed' | 'commission_not_found' | 'commission_state' | 'split_needs_two_brokers';
export class SellingError extends Error {
  constructor(readonly code: SellingErrorCode, message: string) {
    super(message);
  }
}

/** Links a dealer can make per day, enquiries one link can take per day, and enquiries one phone can send one dealer per day. */
export const LINKS_PER_DAY = 100;
export const ENQUIRIES_PER_LINK_PER_DAY = 30;
export const ENQUIRIES_PER_PHONE_PER_DAY = 3;

const sha256 = (s: string) => createHash('sha256').update(s).digest();
const DAY_MS = 86_400_000;

/** A commission's amount from the car's terms at the moment of the sale (D-129), and this broker's share of it. */
export function commissionAmount(terms: { kind: 'fixed' | 'percent'; fixedUgx: number | null; percent: number | null }, salePriceUgx: number, sharePercent: number): number {
  const full = terms.kind === 'fixed' ? terms.fixedUgx! : Math.round((salePriceUgx * terms.percent!) / 100);
  return Math.round((full * sharePercent) / 100);
}

@Injectable()
export class SellingService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(SellingRepository) private readonly repo: SellingRepository,
    @Inject(DealerRepository) private readonly stock: DealerRepository,
    @Inject(DealerService) private readonly dealer: DealerService,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  // Links -------------------------------------------------------------------------------------------------

  /** A new link for a car the dealer has in stock and linked to SAZO. The token is returned once and only its hash is kept. */
  async createLink(actor: Actor, organisationId: string, stockId: string, o: { channel: LinkChannel; showDealerName: boolean; brokerUserId?: string | null }) {
    const car = await this.dealer.get(organisationId, stockId).catch(() => { throw new SellingError('stock_not_found', 'No such car in your stock'); });
    if (car.status !== 'in_stock') throw new SellingError('car_not_available', 'This car is no longer for sale');
    if (!car.vehicleId) throw new SellingError('car_not_linked', 'Add the chassis number first so buyers can see the car’s SAZO history');
    const token = randomBytes(18).toString('base64url');
    const link = await withTx(this.pool, async (tx) => {
      const key = o.brokerUserId ? `broker-links:${o.brokerUserId}` : `car-links:${organisationId}`;
      await enforceLimit(tx, key, LINKS_PER_DAY,
        `SELECT count(*)::int AS n FROM dealer.car_links WHERE ${o.brokerUserId ? 'broker_user_id = $1' : 'organisation_id = $1 AND broker_user_id IS NULL'} AND created_at > now() - interval '1 day'`,
        [o.brokerUserId ?? organisationId], `You can make up to ${LINKS_PER_DAY} links a day`);
      return this.repo.createLink(tx, { organisationId, stockItemId: stockId, channel: o.channel, brokerUserId: o.brokerUserId ?? null, showDealerName: o.showDealerName, createdBy: actor.userId, tokenHash: sha256(token) });
    }).catch((err) => { if (err instanceof LimitReached) throw new SellingError('too_many', err.message); throw err; });
    return { link, token };
  }

  async dealerLinks(organisationId: string, stockId: string) {
    await this.dealer.get(organisationId, stockId).catch(() => { throw new SellingError('stock_not_found', 'No such car in your stock'); });
    return this.repo.dealerLinks(stockId);
  }

  async revokeLink(organisationId: string, linkId: string): Promise<void> {
    const l = await this.repo.link(linkId);
    if (!l || l.organisationId !== organisationId || l.brokerUserId) throw new SellingError('link_not_found', 'No such link');
    await this.repo.revokeLink(linkId);
  }

  /** The link behind a token, if it still leads to a car for sale at an approved dealer. */
  private async liveLink(token: string): Promise<{ link: LinkRow; car: Awaited<ReturnType<DealerService['get']>> }> {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new SellingError('link_not_found', 'This link does not work');
    const link = await this.repo.linkByHash(sha256(token));
    if (!link) throw new SellingError('link_not_found', 'This link does not work');
    const car = await this.stock.get(link.stockItemId);
    const org = await this.iam.organisation(link.organisationId);
    if (link.revokedAt || !car || car.status !== 'in_stock' || !car.vehicleId || org?.status !== 'approved') {
      throw new SellingError('car_not_available', 'This car is no longer for sale');
    }
    return { link, car };
  }

  /**
   * The public car page: photos, the car, its asking price and its SAZO summary. Never costs, notes, the yard,
   * the sale price, commission or staff. A broker's link hides the dealer's name unless the dealer allows it.
   */
  async publicCar(token: string, brokerContact?: (brokerUserId: string) => Promise<{ name: string; whatsapp: string | null } | undefined>) {
    const { link, car } = await this.liveLink(token);
    const view = await this.dealer.view(car);
    const org = await this.iam.organisation(link.organisationId);
    const settings = await this.stock.settings(link.organisationId);
    const broker = link.brokerUserId && brokerContact ? await brokerContact(link.brokerUserId) : undefined;
    const d = view.details;
    return {
      vehicleRef: view.vehicleRef!,
      vehicle: view.vehicle,
      specs: { make: view.vehicle?.make ?? d.make, model: view.vehicle?.model ?? d.model, year: view.vehicle?.year ?? d.modelYear,
        engineCc: d.engineCc, fuel: d.fuel, transmission: d.transmission, colour: d.colour },
      askingPriceUgx: view.askingPriceUgx,
      listedMileageKm: view.listedMileageKm,
      tiktokUrl: d.tiktokUrl,
      photos: view.photos.map((p) => p.photoId),
      questions: view.questions,
      recordConfidence: view.recordConfidence,
      seller: broker ? { kind: 'broker' as const, name: broker.name, dealerName: link.showDealerName ? org?.tradingName ?? org?.legalName ?? null : null, whatsapp: broker.whatsapp }
        : { kind: 'dealer' as const, name: link.showDealerName ? org?.tradingName ?? org?.legalName ?? null : null, dealerName: null, whatsapp: settings.whatsappE164 },
    };
  }

  async publicPhoto(token: string, photoId: string) {
    const { car } = await this.liveLink(token);
    return this.dealer.photoContent(car.id, photoId);
  }

  /**
   * An enquiry from the public car page. The customer agrees to be contacted; one phone sending again about the
   * same car does not make a second enquiry. Limits per link and per phone stop the page being used to flood a dealer.
   */
  async enquire(token: string, e: { name: string; phone: string; consent: boolean; message?: string }): Promise<{ status: 'received' | 'already_received' }> {
    if (!e.consent) throw new SellingError('consent_required', 'Tick the box to let the seller contact you');
    const { link, car } = await this.liveLink(token);
    const phoneHash = this.parties.phoneHash(e.phone);
    return withTx(this.pool, async (tx) => {
      await enforceLimit(tx, `enquiry-link:${link.id}`, ENQUIRIES_PER_LINK_PER_DAY,
        `SELECT count(*)::int AS n FROM dealer.leads WHERE car_link_id = $1 AND created_at > now() - interval '1 day'`, [link.id], 'This car has had many enquiries today. Please try again tomorrow or call the seller.');
      if (await this.repo.openLeadFor(tx, link.organisationId, phoneHash, car.id)) return { status: 'already_received' as const };
      await enforceLimit(tx, `enquiry-phone:${link.organisationId}:${phoneHash.toString('hex')}`, ENQUIRIES_PER_PHONE_PER_DAY,
        `SELECT count(*)::int AS n FROM dealer.leads WHERE organisation_id = $1 AND phone_hash = $2 AND created_at > now() - interval '1 day'`,
        [link.organisationId, phoneHash], 'You have sent several enquiries today. The seller will contact you.');
      const partyId = await this.parties.recordPerson({ name: e.name, phone: e.phone }, tx);
      await this.parties.recordConsent(partyId, 'dealer_contact', 'car_page', tx);
      const source: LeadSource = link.brokerUserId ? 'broker' : link.channel;
      const credit = await this.credit(tx, link.organisationId, phoneHash, link.brokerUserId);
      await this.repo.insertLead(tx, { organisationId: link.organisationId, stockItemId: car.id, partyId, phoneHash, source, carLinkId: link.id,
        consentToContact: true, message: e.message ?? null, createdBy: null, ...credit });
      return { status: 'received' as const };
    }).catch((err) => { if (err instanceof LimitReached) throw new SellingError('too_many', err.message); throw err; });
  }

  /**
   * Who brought this customer (D-128). A customer a broker registered stays that broker's for the dealer's
   * protection period: a later enquiry from the same phone through the dealer's own link or staff is credited
   * to that broker. When a different broker (or a broker after the dealer already knew the customer) registers
   * the same phone, the new enquiry is marked for the dealer to decide, with the earlier one shown.
   */
  private async credit(tx: Sql, organisationId: string, phoneHash: Buffer, broker: string | null) {
    const earlier = await this.repo.earlierLeadFor(tx, organisationId, phoneHash);
    const days = (await this.stock.settings(organisationId)).leadProtectionDays;
    const protectedBroker = earlier?.brokerUserId && earlier.protectedUntil && new Date(earlier.protectedUntil) > new Date() ? earlier : undefined;
    if (!broker) {
      if (protectedBroker) return { brokerUserId: protectedBroker.brokerUserId, protectedUntil: protectedBroker.protectedUntil, earlierLeadId: protectedBroker.id, needsDecision: false };
      return { brokerUserId: null, protectedUntil: null, earlierLeadId: null, needsDecision: false };
    }
    const until = new Date(Date.now() + days * DAY_MS);
    if (!earlier || earlier.brokerUserId === broker) return { brokerUserId: broker, protectedUntil: earlier?.brokerUserId === broker ? earlier.protectedUntil : until, earlierLeadId: earlier?.id ?? null, needsDecision: false };
    return { brokerUserId: broker, protectedUntil: until, earlierLeadId: earlier.id, needsDecision: true };
  }

  // Enquiries (dealer staff) ------------------------------------------------------------------------------

  /** An enquiry a salesperson adds (a walk-in, a phone call, a WhatsApp message). */
  async addLead(actor: Actor, organisationId: string, l: { stockId?: string; name: string; phone: string; source: LeadSource; message?: string; consent: boolean }): Promise<LeadRow> {
    if (l.stockId) await this.dealer.get(organisationId, l.stockId).catch(() => { throw new SellingError('stock_not_found', 'No such car in your stock'); });
    const phoneHash = this.parties.phoneHash(l.phone);
    return withTx(this.pool, async (tx) => {
      const existing = await this.repo.openLeadFor(tx, organisationId, phoneHash, l.stockId ?? null);
      if (existing) return existing;
      const partyId = await this.parties.recordPerson({ name: l.name, phone: l.phone }, tx);
      if (l.consent) await this.parties.recordConsent(partyId, 'dealer_contact', 'staff', tx);
      const credit = await this.credit(tx, organisationId, phoneHash, null);
      return this.repo.insertLead(tx, { organisationId, stockItemId: l.stockId ?? null, partyId, phoneHash, source: l.source, carLinkId: null,
        consentToContact: l.consent, message: l.message ?? null, createdBy: actor.userId, ...credit });
    });
  }

  async lead(organisationId: string, id: string): Promise<LeadRow> {
    const l = await this.repo.lead(id);
    if (!l || l.organisationId !== organisationId) throw new SellingError('lead_not_found', 'No such enquiry');
    return l;
  }

  /**
   * Move an enquiry to another stage. Completed needs the selling price and records the car's sale (its price
   * stays private); a closed enquiry cannot move, except that a lost one can be reopened.
   */
  async moveStage(actor: Actor, organisationId: string, id: string, to: LeadStage, o: { salePriceUgx?: number; note?: string }): Promise<LeadRow> {
    const l = await this.lead(organisationId, id);
    if (l.stage === to) return l;
    if (l.stage === 'completed' || (l.stage === 'lost' && to !== 'enquiry')) throw new SellingError('lead_closed', 'This enquiry is closed');
    if (to === 'completed') {
      if (!o.salePriceUgx) throw new SellingError('sale_price_required', 'Enter the price the car sold for. Buyers never see it.');
      if (!l.stockItemId) throw new SellingError('car_not_available', 'Choose the car this customer bought first');
      // The sale goes into the car's history first; if the car is no longer in stock, nothing changes here.
      await this.dealer.markSold(actor, organisationId, l.stockItemId, o.salePriceUgx, new Date().toISOString().slice(0, 10)).catch((err) => {
        if (err instanceof DealerError && err.code === 'not_in_stock') throw new SellingError('car_not_available', 'This car is no longer in your stock');
        throw err;
      });
    }
    await withTx(this.pool, async (tx) => {
      if (!(await this.repo.setStage(tx, id, l.stage, to, to === 'completed' ? o.salePriceUgx! : null))) throw new SellingError('stage_conflict', 'Someone else changed this enquiry. Reload and try again.');
      await this.repo.event(tx, { organisationId, leadId: id, kind: 'stage', fromStage: l.stage, toStage: to, note: o.note ?? null, actorUserId: actor.userId });
      if (to === 'completed') await this.workOutCommissions(tx, actor, (await this.repo.lead(id, tx))!, 'Sale completed');
    });
    return this.lead(organisationId, id);
  }

  /**
   * Commissions for a completed sale, from the car's terms at the moment of the sale. Held while the dealer
   * still has to decide who brought the customer. Re-run after a decision: brokers no longer credited have
   * their commission cancelled, with the reason kept.
   */
  private async workOutCommissions(tx: Sql, actor: Actor, lead: LeadRow, why: string) {
    if (lead.stage !== 'completed' || !lead.stockItemId || !lead.salePriceUgx) return;
    const car = await this.stock.get(lead.stockItemId, tx);
    const terms = car?.commissionKind ? { kind: car.commissionKind, fixedUgx: car.commissionFixedUgx, percent: car.commissionPercent } : undefined;
    const shares = new Map<string, number>();
    if (lead.brokerUserId) shares.set(lead.brokerUserId, lead.splitBrokerUserId ? lead.splitPercent ?? 50 : 100);
    if (lead.splitBrokerUserId) shares.set(lead.splitBrokerUserId, 100 - (lead.splitPercent ?? 50));
    const status = lead.needsDecision ? 'on_hold' as const : 'pending' as const;
    const current = await this.repo.commissionsForLead(tx, lead.id);
    for (const existing of current) {
      if (!shares.has(existing.brokerUserId) && existing.status !== 'cancelled' && existing.status !== 'paid') {
        await this.repo.setCommissionStatus(tx, existing.id, existing.status, 'cancelled', null);
        await this.repo.commissionEvent(tx, { organisationId: lead.organisationId, commissionId: existing.id, fromStatus: existing.status, toStatus: 'cancelled', amountUgx: existing.amountUgx, note: why, actorUserId: actor.userId });
      }
    }
    if (!terms) return;
    for (const [broker, share] of shares) {
      if (current.find((c) => c.brokerUserId === broker)?.status === 'paid') continue; // a paid record is never rewritten
      const amount = commissionAmount(terms, lead.salePriceUgx, share);
      const { row, before } = await this.repo.upsertCommission(tx, { organisationId: lead.organisationId, leadId: lead.id, stockItemId: lead.stockItemId, brokerUserId: broker,
        kind: terms.kind, percent: terms.kind === 'percent' ? terms.percent : null, salePriceUgx: lead.salePriceUgx, sharePercent: share, amountUgx: amount, status });
      await this.repo.commissionEvent(tx, { organisationId: lead.organisationId, commissionId: row.id, fromStatus: before?.status ?? null, toStatus: row.status, amountUgx: amount, note: why, actorUserId: actor.userId });
    }
  }

  /**
   * The dealer decides who brought a customer two people claimed (D-128): keep this enquiry's broker, credit the
   * earlier registration, split between the two brokers, or record that it was the dealer's own customer.
   * The decision and its reason are kept for good; commissions follow it.
   */
  async decide(actor: Actor, organisationId: string, id: string, d: { outcome: 'keep' | 'earlier' | 'split' | 'dealer'; reason: string; splitPercent?: number }): Promise<LeadRow> {
    const l = await this.lead(organisationId, id);
    if (!l.needsDecision) throw new SellingError('no_decision_needed', 'Nobody else claims this customer');
    const earlier = l.earlierLeadId ? await this.repo.lead(l.earlierLeadId) : undefined;
    let broker: string | null = l.brokerUserId;
    let split: string | null = null;
    let pct: number | null = null;
    if (d.outcome === 'earlier') broker = earlier?.brokerUserId ?? null;
    if (d.outcome === 'dealer') broker = null;
    if (d.outcome === 'split') {
      if (!l.brokerUserId || !earlier?.brokerUserId || earlier.brokerUserId === l.brokerUserId) throw new SellingError('split_needs_two_brokers', 'A split needs two different brokers');
      split = earlier.brokerUserId;
      pct = d.splitPercent ?? 50;
    }
    await withTx(this.pool, async (tx) => {
      await this.repo.decide(tx, { organisationId, leadId: id, outcome: d.outcome, brokerUserId: broker, splitBrokerUserId: split, splitPercent: pct, reason: d.reason, decidedBy: actor.userId });
      await this.repo.event(tx, { organisationId, leadId: id, kind: 'note', note: `Decided who brought the customer: ${d.reason}`, actorUserId: actor.userId });
      await this.workOutCommissions(tx, actor, (await this.repo.lead(id, tx))!, `Decision: ${d.reason}`);
    });
    return this.lead(organisationId, id);
  }

  async commissions(organisationId: string) {
    return this.repo.commissions({ organisationId });
  }

  /** Approve a pending commission, mark an approved one paid (with a reference), or cancel one not yet paid, with a reason. */
  async commissionAction(actor: Actor, organisationId: string, id: string, action: 'approve' | 'paid' | 'cancel', note?: string) {
    const c = await this.repo.commission(id);
    if (!c || c.organisationId !== organisationId) throw new SellingError('commission_not_found', 'No such commission');
    const move = ({ approve: ['pending', 'approved'], paid: ['approved', 'paid'], cancel: [c.status, 'cancelled'] } as const)[action];
    if (move[0] !== c.status || (action === 'cancel' && (c.status === 'paid' || c.status === 'cancelled'))) {
      throw new SellingError('commission_state', action === 'approve' ? 'Only a pending commission can be approved' : action === 'paid' ? 'Approve the commission before marking it paid' : 'This commission can no longer be cancelled');
    }
    await withTx(this.pool, async (tx) => {
      if (!(await this.repo.setCommissionStatus(tx, id, move[0], move[1], action === 'paid' ? note ?? null : null))) throw new SellingError('commission_state', 'Someone else changed this commission. Reload and try again.');
      await this.repo.commissionEvent(tx, { organisationId, commissionId: id, fromStatus: move[0], toStatus: move[1], amountUgx: c.amountUgx, note: note ?? null, actorUserId: actor.userId });
    });
    return (await this.repo.commission(id))!;
  }

  async addNote(actor: Actor, organisationId: string, id: string, note: string): Promise<void> {
    await this.lead(organisationId, id);
    await this.repo.event(this.pool, { organisationId, leadId: id, kind: 'note', note, actorUserId: actor.userId });
  }

  async leads(organisationId: string, stages?: LeadStage[]) {
    return this.repo.leads(organisationId, stages);
  }

  async events(leadId: string) {
    return this.repo.events(leadId);
  }

  bySource(organisationId: string, since: string) {
    return this.repo.bySource(organisationId, since);
  }

  /** What the dealer's staff see for each enquiry: the customer (decrypted for them only), the car and the stage. */
  async leadViews(rows: LeadRow[]) {
    const cars = new Map<string, string>();
    const earlierRows = new Map<string, LeadRow | undefined>();
    for (const r of rows) if (r.earlierLeadId && !earlierRows.has(r.earlierLeadId)) earlierRows.set(r.earlierLeadId, await this.repo.lead(r.earlierLeadId));
    const users = await this.iam.firstNames(rows.flatMap((r) => [r.createdBy, r.brokerUserId, r.splitBrokerUserId, earlierRows.get(r.earlierLeadId ?? '')?.brokerUserId].filter((x): x is string => !!x)));
    return Promise.all(rows.map(async (r) => {
      const person = await this.parties.reveal(r.partyId);
      let car: string | null = null;
      if (r.stockItemId) {
        if (!cars.has(r.stockItemId)) {
          const s = await this.stock.get(r.stockItemId);
          const v = s ? (await this.dealer.view(s)).vehicle : null;
          cars.set(r.stockItemId, v?.make ? [v.year, v.make, v.model].filter(Boolean).join(' ') : s ? [s.modelYear, s.make, s.model].filter(Boolean).join(' ') : '');
        }
        car = cars.get(r.stockItemId) || null;
      }
      return {
        leadId: r.id, stage: r.stage, source: r.source, open: OPEN_STAGES.includes(r.stage),
        customer: { name: person?.name ?? null, phone: person?.phone ?? null },
        consentToContact: r.consentToContact, message: r.message,
        stockId: r.stockItemId, car, salePriceUgx: r.salePriceUgx,
        broker: r.brokerUserId ? users.get(r.brokerUserId) ?? 'A broker' : null,
        splitBroker: r.splitBrokerUserId ? { name: users.get(r.splitBrokerUserId) ?? 'A broker', percent: 100 - (r.splitPercent ?? 50) } : null,
        protectedUntil: r.protectedUntil ? new Date(r.protectedUntil).toISOString() : null,
        needsDecision: r.needsDecision,
        earlier: (() => {
          const e = r.earlierLeadId ? earlierRows.get(r.earlierLeadId) : undefined;
          return e ? { at: new Date(e.createdAt).toISOString(), by: e.brokerUserId ? users.get(e.brokerUserId) ?? 'A broker' : 'Your team', broker: !!e.brokerUserId } : null;
        })(),
        addedBy: r.createdBy ? users.get(r.createdBy) ?? null : null,
        createdAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString(),
      };
    }));
  }
}
