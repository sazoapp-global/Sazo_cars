// Dealer payments (D-122, D-146): how a buyer pays for a car the dealer sold. Cash in full, or a deposit and
// monthly instalments. Records only; no money moves through SAZO. A saved payment is never changed: a mistake is
// fixed with a correction. Each payment has a receipt number and the buyer gets an SMS receipt. Reminders go out
// before and on each due date and when a payment is late (buyer and managers), once each.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { NotificationsService } from '../notify/index.js';
import { PartiesService } from '../obs/index.js';
import { ReportsService } from '../report/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerError, DealerService } from './dealer.service.js';
import { SellingRepository } from './selling.repository.js';

export type PayMethod = 'cash' | 'mtn_momo' | 'airtel_money' | 'bank';
export const PAY_METHODS: PayMethod[] = ['cash', 'mtn_momo', 'airtel_money', 'bank'];
export type InstalmentStatus = 'paid' | 'part_paid' | 'late' | 'due_soon' | 'coming';

/** Days before a due date that the buyer is reminded; days after it that a payment counts as late for texts. */
const REMIND_BEFORE_DAYS = 3;
const LATE_TEXT_AFTER_DAYS = 1;
const DUE_SOON_DAYS = 7;

export interface NewPlan {
  buyer: { leadId: string } | { name: string; phone: string };
  kind: 'cash' | 'instalments';
  /** Instalments: paid at the sale, counted as payment 0. */
  depositUgx?: number;
  months?: number;
  firstDueOn?: string;
  /** Optional: each monthly amount, adding up to the price less the deposit. */
  amounts?: number[];
  reminders: boolean;
  /** What was paid at the sale (cash: the whole price; instalments: the deposit), if anything. */
  paidAtSale?: { method: PayMethod; reference?: string };
}

interface PlanRow {
  id: string; organisationId: string; stockItemId: string; leadId: string | null; partyId: string; kind: 'cash' | 'instalments';
  priceUgx: number; depositUgx: number; months: number | null; reminders: boolean; createdAt: Date; soldOn: string;
}
interface InstalmentRow { seq: number; dueOn: string; amountUgx: number }
interface PaymentRow {
  id: string; amountUgx: number; method: PayMethod | 'correction'; paidOn: string; reference: string | null; receiptNo: string;
  correctsPaymentId: string | null; note: string | null; createdAt: Date;
}

const PLAN_COLS = `p.id, p.organisation_id AS "organisationId", p.stock_item_id AS "stockItemId", p.lead_id AS "leadId", p.party_id AS "partyId",
  p.kind, p.price_ugx::float8 AS "priceUgx", p.deposit_ugx::float8 AS "depositUgx", p.months, p.reminders, p.created_at AS "createdAt",
  to_char((s.sold_at AT TIME ZONE 'Africa/Kampala')::date, 'YYYY-MM-DD') AS "soldOn"`;

/** Today in Kampala, as YYYY-MM-DD. */
export function kampalaToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** The same day of the month n months later (the 31st becomes the last day of a shorter month). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Equal monthly amounts in whole thousands; the last one takes what is left over. */
export function monthlyAmounts(total: number, months: number): number[] {
  const each = Math.floor(total / months / 1000) * 1000 || Math.floor(total / months);
  const out = Array.from({ length: months }, () => each);
  out[months - 1] = total - each * (months - 1);
  return out;
}

/** Money paid so far goes to the oldest instalment first. */
export function allocate(instalments: InstalmentRow[], paidTotal: number, today: string) {
  let left = paidTotal;
  return instalments.map((i) => {
    const paid = Math.max(0, Math.min(i.amountUgx, left));
    left -= paid;
    const owing = i.amountUgx - paid;
    const status: InstalmentStatus = owing === 0 ? 'paid'
      : i.dueOn < today ? 'late'
      : paid > 0 ? 'part_paid'
      : daysBetween(today, i.dueOn) <= DUE_SOON_DAYS ? 'due_soon' : 'coming';
    return { seq: i.seq, dueOn: i.dueOn, amountUgx: i.amountUgx, paidUgx: paid, owingUgx: owing, status, daysLate: status === 'late' ? daysBetween(i.dueOn, today) : 0 };
  });
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

@Injectable()
export class PaymentsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Payments');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(DealerService) private readonly dealer: DealerService,
    @Inject(DealerRepository) private readonly stockRepo: DealerRepository,
    @Inject(SellingRepository) private readonly leads: SellingRepository,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** The car's report shows "balance still owed to a dealer: yes/no" (D-123), and reminders run every hour. */
  onApplicationBootstrap(): void {
    this.reports.addStatusSource(async (vehicleIds) => ({ dealerBalance: await this.balanceStatus(vehicleIds) }));
    if (this.cfg.NODE_ENV !== 'test') {
      this.timer = setInterval(() => { void this.sendReminders().catch((e: Error) => this.log.warn(`reminders: ${e.message}`)); }, 3600_000);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- reading

  private async plan(organisationId: string, planId: string, sql: Sql = this.pool): Promise<PlanRow> {
    const { rows: [p] } = await sql.query<PlanRow>(
      `SELECT ${PLAN_COLS} FROM dealer.payment_plans p JOIN dealer.stock_items s ON s.id = p.stock_item_id WHERE p.id = $1 AND p.organisation_id = $2`, [planId, organisationId]);
    if (!p) throw new DealerError('plan_not_found', 'No such sale in your payments');
    return p;
  }

  private async instalments(planIds: string[]): Promise<Map<string, InstalmentRow[]>> {
    const { rows } = await this.pool.query<InstalmentRow & { planId: string }>(
      `SELECT plan_id AS "planId", seq, to_char(due_on, 'YYYY-MM-DD') AS "dueOn", amount_ugx::float8 AS "amountUgx"
         FROM dealer.plan_instalments WHERE plan_id = ANY($1) ORDER BY plan_id, seq`, [planIds]);
    const out = new Map<string, InstalmentRow[]>();
    for (const r of rows) out.set(r.planId, [...(out.get(r.planId) ?? []), { seq: r.seq, dueOn: r.dueOn, amountUgx: r.amountUgx }]);
    return out;
  }

  private async payments(planIds: string[]): Promise<Map<string, PaymentRow[]>> {
    const { rows } = await this.pool.query<PaymentRow & { planId: string }>(
      `SELECT plan_id AS "planId", id, amount_ugx::float8 AS "amountUgx", method, to_char(paid_on, 'YYYY-MM-DD') AS "paidOn", reference,
              receipt_no AS "receiptNo", corrects_payment_id AS "correctsPaymentId", note, created_at AS "createdAt"
         FROM dealer.payments WHERE plan_id = ANY($1) ORDER BY paid_on DESC, created_at DESC`, [planIds]);
    const out = new Map<string, PaymentRow[]>();
    for (const r of rows) out.set(r.planId, [...(out.get(r.planId) ?? []), r]);
    return out;
  }

  private async car(organisationId: string, stockItemId: string) {
    const r = await this.dealer.get(organisationId, stockItemId);
    const v = r.vehicleId ? await this.registry.getVehicle(r.vehicleId) : undefined;
    const card = v ? await this.registry.card(v.id).catch(() => undefined) : undefined;
    const name = [r.make, r.model].filter(Boolean).join(' ') || 'Car';
    return { stockId: r.id, name: r.modelYear ? `${name} ${r.modelYear}` : name, plate: (card as { currentPlate?: string } | undefined)?.currentPlate ?? r.heldIdentifiers?.plate ?? null };
  }

  private summarise(p: PlanRow, inst: InstalmentRow[], pays: PaymentRow[], today: string) {
    const paid = pays.reduce((n, x) => n + x.amountUgx, 0);
    const rows = allocate(inst, paid, today);
    const next = rows.find((r) => r.owingUgx > 0);
    const late = rows.filter((r) => r.status === 'late');
    return {
      planId: p.id, kind: p.kind, priceUgx: p.priceUgx, depositUgx: p.depositUgx, months: p.months, soldOn: p.soldOn,
      paidUgx: paid, balanceUgx: Math.max(0, p.priceUgx - paid),
      lateUgx: late.reduce((n, r) => n + r.owingUgx, 0), daysLate: late.length ? Math.max(...late.map((r) => r.daysLate)) : 0,
      next: next ? { seq: next.seq, dueOn: next.dueOn, owingUgx: next.owingUgx, status: next.status } : null,
      state: paid >= p.priceUgx ? 'paid' as const : late.length ? 'late' as const : 'owing' as const,
      instalmentsCount: inst.length,
    };
  }

  /** Managers' list: every sale with a payment record, the sold cars without one, and the totals for the cards. */
  async list(organisationId: string, filter: 'owing' | 'late' | 'paid' | 'all' = 'all', today = kampalaToday()) {
    const { rows: plans } = await this.pool.query<PlanRow>(
      `SELECT ${PLAN_COLS} FROM dealer.payment_plans p JOIN dealer.stock_items s ON s.id = p.stock_item_id
        WHERE p.organisation_id = $1 ORDER BY s.sold_at DESC`, [organisationId]);
    const ids = plans.map((p) => p.id);
    const [inst, pays] = await Promise.all([this.instalments(ids), this.payments(ids)]);
    const all = await Promise.all(plans.map(async (p) => {
      const person = await this.parties.reveal(p.partyId);
      return { ...this.summarise(p, inst.get(p.id) ?? [], pays.get(p.id) ?? [], today), car: await this.car(organisationId, p.stockItemId), buyer: { name: person?.name ?? null } };
    }));
    const month = today.slice(0, 7);
    const received = [...pays.values()].flat().filter((x) => x.paidOn.startsWith(month));
    const { rows: unplanned } = await this.pool.query<{ id: string; soldOn: string; salePriceUgx: number }>(
      `SELECT s.id, to_char((s.sold_at AT TIME ZONE 'Africa/Kampala')::date, 'YYYY-MM-DD') AS "soldOn", s.sale_price_ugx::float8 AS "salePriceUgx"
         FROM dealer.stock_items s WHERE s.organisation_id = $1 AND s.status = 'sold'
          AND NOT EXISTS (SELECT 1 FROM dealer.payment_plans p WHERE p.stock_item_id = s.id) ORDER BY s.sold_at DESC LIMIT 50`, [organisationId]);
    return {
      summary: {
        owedUgx: all.reduce((n, x) => n + x.balanceUgx, 0),
        owingSales: all.filter((x) => x.state !== 'paid').length,
        receivedThisMonthUgx: received.reduce((n, x) => n + x.amountUgx, 0),
        receivedThisMonthCount: received.filter((x) => x.amountUgx > 0).length,
        lateUgx: all.reduce((n, x) => n + x.lateUgx, 0),
        lateBuyers: all.filter((x) => x.state === 'late').length,
      },
      items: all.filter((x) => filter === 'all' || (filter === 'paid' ? x.state === 'paid' : filter === 'late' ? x.state === 'late' : x.state !== 'paid')),
      unplanned: await Promise.all(unplanned.map(async (u) => ({ car: await this.car(organisationId, u.id), soldOn: u.soldOn, salePriceUgx: u.salePriceUgx }))),
    };
  }

  /** One sale: the plan with each payment's status, the payments received and the buyer. */
  async detail(organisationId: string, planId: string, today = kampalaToday()) {
    const p = await this.plan(organisationId, planId);
    const [inst, pays, person] = await Promise.all([this.instalments([p.id]), this.payments([p.id]), this.parties.reveal(p.partyId)]);
    const i = inst.get(p.id) ?? [];
    const ps = pays.get(p.id) ?? [];
    const corrected = new Set(ps.map((x) => x.correctsPaymentId).filter(Boolean));
    return {
      ...this.summarise(p, i, ps, today),
      reminders: p.reminders,
      car: await this.car(organisationId, p.stockItemId),
      buyer: { name: person?.name ?? null, phone: person?.phone ?? null },
      schedule: allocate(i, ps.reduce((n, x) => n + x.amountUgx, 0), today),
      payments: ps.map((x) => ({ ...x, createdAt: new Date(x.createdAt).toISOString(), corrected: corrected.has(x.id) })),
    };
  }

  // ---------- writing

  private async nextReceipt(tx: Sql, organisationId: string): Promise<string> {
    const { rows: [r] } = await tx.query<{ n: number }>(
      `INSERT INTO dealer.receipt_counters (organisation_id, last_no) VALUES ($1, 1)
       ON CONFLICT (organisation_id) DO UPDATE SET last_no = dealer.receipt_counters.last_no + 1 RETURNING last_no AS n`, [organisationId]);
    return `R-${String(r!.n).padStart(4, '0')}`;
  }

  /** Set up how a sold car is paid for. Whatever was paid at the sale is recorded (and receipted) at once. */
  async createPlan(actor: Actor, organisationId: string, stockItemId: string, n: NewPlan): Promise<string> {
    const car = await this.dealer.get(organisationId, stockItemId);
    if (car.status !== 'sold' || !car.salePriceUgx || !car.soldAt) throw new DealerError('not_sold', 'Mark the car as sold first');
    const price = car.salePriceUgx;
    const soldOn = kampalaToday(new Date(car.soldAt));
    let partyId: string;
    let leadId: string | null = null;
    if ('leadId' in n.buyer) {
      const lead = await this.leads.lead(n.buyer.leadId);
      if (!lead || lead.organisationId !== organisationId) throw new DealerError('lead_not_found', 'No such enquiry');
      partyId = lead.partyId;
      leadId = lead.id;
    } else {
      partyId = await this.parties.recordPerson({ name: n.buyer.name, phone: n.buyer.phone });
    }
    const schedule: { dueOn: string; amountUgx: number }[] = [];
    if (n.kind === 'cash') {
      schedule.push({ dueOn: soldOn, amountUgx: price });
    } else {
      const deposit = n.depositUgx ?? 0;
      const months = n.months!;
      if (deposit >= price) throw new DealerError('plan_invalid', 'The deposit must be less than the sale price');
      const amounts = n.amounts ?? monthlyAmounts(price - deposit, months);
      if (amounts.length !== months || amounts.some((a) => a <= 0)) throw new DealerError('plan_invalid', `Give ${months} monthly amounts, each more than 0`);
      if (amounts.reduce((a, b) => a + b, 0) !== price - deposit) throw new DealerError('plan_invalid', `The monthly amounts must add up to UGX ${fmt(price - deposit)} (the price less the deposit)`);
      if (n.firstDueOn! < soldOn) throw new DealerError('plan_invalid', 'The first payment cannot be due before the sale');
      if (deposit > 0) schedule.push({ dueOn: soldOn, amountUgx: deposit });
      amounts.forEach((a, k) => schedule.push({ dueOn: addMonths(n.firstDueOn!, k), amountUgx: a }));
    }
    const atSale = n.kind === 'cash' ? price : (n.depositUgx ?? 0);
    const { planId, receipt } = await withTx(this.pool, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO dealer.payment_plans (organisation_id, stock_item_id, lead_id, party_id, kind, price_ugx, deposit_ugx, months, reminders, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (stock_item_id) DO NOTHING RETURNING id`,
        [organisationId, stockItemId, leadId, partyId, n.kind, price, n.kind === 'cash' ? 0 : n.depositUgx ?? 0, n.kind === 'cash' ? null : n.months, n.reminders, actor.userId]);
      if (!r.rows[0]) throw new DealerError('plan_exists', 'This car already has a payment record');
      const id = r.rows[0].id;
      // Payment 0 is the deposit (or the cash price); without a deposit the monthly ones start at 1.
      const first = schedule.length && (n.kind === 'cash' || (n.depositUgx ?? 0) > 0) ? 0 : 1;
      for (const [k, s] of schedule.entries()) {
        await tx.query(`INSERT INTO dealer.plan_instalments (plan_id, seq, due_on, amount_ugx) VALUES ($1,$2,$3,$4)`, [id, first + k, s.dueOn, s.amountUgx]);
      }
      let rec: { id: string; receiptNo: string } | undefined;
      if (n.paidAtSale && atSale > 0) rec = await this.insertPayment(tx, organisationId, id, actor.userId, { amountUgx: atSale, method: n.paidAtSale.method, paidOn: soldOn, reference: n.paidAtSale.reference });
      await this.iam.audit({ actor, organisationId, action: 'dealer.payment_plan_created', targetType: 'dealer_payment_plan', targetId: id, details: { kind: n.kind } }, tx);
      return { planId: id, receipt: rec };
    });
    if (receipt) await this.sendReceipt(organisationId, planId, receipt.receiptNo, atSale);
    return planId;
  }

  private async insertPayment(tx: Sql, organisationId: string, planId: string, userId: string,
    p: { amountUgx: number; method: PayMethod | 'correction'; paidOn: string; reference?: string; note?: string; corrects?: string }): Promise<{ id: string; receiptNo: string }> {
    const receiptNo = await this.nextReceipt(tx, organisationId);
    const { rows: [r] } = await tx.query<{ id: string }>(
      `INSERT INTO dealer.payments (plan_id, organisation_id, amount_ugx, method, paid_on, reference, receipt_no, corrects_payment_id, note, recorded_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [planId, organisationId, p.amountUgx, p.method, p.paidOn, p.reference?.trim() || null, receiptNo, p.corrects ?? null, p.note?.trim() || null, userId]);
    return { id: r!.id, receiptNo };
  }

  /** A payment received. It can't be more than what is still owed. The buyer gets an SMS receipt. */
  async recordPayment(actor: Actor, organisationId: string, planId: string, p: { amountUgx: number; method: PayMethod; paidOn: string; reference?: string; note?: string }) {
    const r = await withTx(this.pool, async (tx) => {
      const plan = await this.plan(organisationId, planId, tx);
      await tx.query(`SELECT 1 FROM dealer.payment_plans WHERE id = $1 FOR UPDATE`, [planId]); // one payment at a time per sale
      if (p.paidOn < plan.soldOn) throw new DealerError('plan_invalid', 'A payment cannot be before the sale');
      const { rows: [s] } = await tx.query<{ paid: number }>(`SELECT COALESCE(sum(amount_ugx), 0)::float8 AS paid FROM dealer.payments WHERE plan_id = $1`, [planId]);
      const balance = plan.priceUgx - s!.paid;
      if (balance <= 0) throw new DealerError('fully_paid', 'This car is already paid in full');
      if (p.amountUgx > balance) throw new DealerError('more_than_owed', `That is more than the UGX ${fmt(balance)} still owed`);
      const rec = await this.insertPayment(tx, organisationId, planId, actor.userId, p);
      await this.iam.audit({ actor, organisationId, action: 'dealer.payment_recorded', targetType: 'dealer_payment_plan', targetId: planId, details: { receipt: rec.receiptNo } }, tx);
      return rec;
    });
    await this.sendReceipt(organisationId, planId, r.receiptNo, p.amountUgx);
    return { paymentId: r.id, receiptNo: r.receiptNo };
  }

  /** A mistake: the payment stays on record and a correction takes its amount back off. */
  async correctPayment(actor: Actor, organisationId: string, planId: string, paymentId: string, reason: string) {
    return withTx(this.pool, async (tx) => {
      await this.plan(organisationId, planId, tx);
      const { rows: [x] } = await tx.query<{ amount: number; method: string; receiptNo: string }>(
        `SELECT amount_ugx::float8 AS amount, method, receipt_no AS "receiptNo" FROM dealer.payments WHERE id = $1 AND plan_id = $2`, [paymentId, planId]);
      if (!x) throw new DealerError('payment_not_found', 'No such payment');
      if (x.method === 'correction') throw new DealerError('plan_invalid', 'A correction cannot be corrected');
      const done = await tx.query(`SELECT 1 FROM dealer.payments WHERE corrects_payment_id = $1`, [paymentId]);
      if (done.rowCount) throw new DealerError('already_corrected', 'This payment was already corrected');
      const rec = await this.insertPayment(tx, organisationId, planId, actor.userId, {
        amountUgx: -x.amount, method: 'correction', paidOn: kampalaToday(), note: `Corrects ${x.receiptNo}: ${reason}`, corrects: paymentId });
      await this.iam.audit({ actor, organisationId, action: 'dealer.payment_corrected', targetType: 'dealer_payment_plan', targetId: planId, details: { receipt: x.receiptNo, reason } }, tx);
      return { paymentId: rec.id, receiptNo: rec.receiptNo };
    });
  }

  /** One payment, for its printed receipt. */
  async receipt(organisationId: string, planId: string, paymentId: string) {
    const d = await this.detail(organisationId, planId);
    const x = d.payments.find((y) => y.id === paymentId);
    if (!x) throw new DealerError('payment_not_found', 'No such payment');
    const paidUpTo = d.payments.filter((y) => y.createdAt <= x.createdAt).reduce((n, y) => n + y.amountUgx, 0);
    const org = await this.iam.organisation(organisationId);
    return {
      receiptNo: x.receiptNo, paidOn: x.paidOn, amountUgx: x.amountUgx, method: x.method, reference: x.reference, note: x.note,
      dealer: { name: org?.tradingName ?? org?.legalName ?? 'Dealer', phone: (await this.stockRepo.settings(organisationId)).whatsappE164 },
      buyer: d.buyer, car: d.car, priceUgx: d.priceUgx, balanceAfterUgx: Math.max(0, d.priceUgx - paidUpTo),
    };
  }

  // ---------- texts

  private async dealerName(organisationId: string) {
    const org = await this.iam.organisation(organisationId);
    return org?.tradingName ?? org?.legalName ?? 'Your dealer';
  }

  private async sendReceipt(organisationId: string, planId: string, receiptNo: string, amount: number): Promise<void> {
    try {
      const d = await this.detail(organisationId, planId);
      if (!d.buyer.phone) return;
      await this.notify.sendSmsToPhone(d.buyer.phone, 'dealer_payment_receipt', {
        receipt: receiptNo, dealer: await this.dealerName(organisationId), amount: fmt(amount), plate: d.car.plate ?? d.car.name, balance: fmt(d.balanceUgx),
      }, 'account', null, { relatedType: 'dealer_payment_plan', relatedId: planId });
    } catch (e) {
      this.log.warn(`receipt SMS not sent: ${(e as Error).message}`);
    }
  }

  /**
   * Reminders for every plan that wants them: 3 days before a due date, on it, and the day after it if still unpaid
   * (the buyer and the dealer's managers). Each is sent once. Runs every hour from 08:00 Kampala time.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const hour = (now.getUTCHours() + 3) % 24;
    if (hour < 8 || hour >= 20) return 0;
    const today = kampalaToday(now);
    const { rows: plans } = await this.pool.query<PlanRow>(
      `SELECT ${PLAN_COLS} FROM dealer.payment_plans p JOIN dealer.stock_items s ON s.id = p.stock_item_id
        WHERE p.kind = 'instalments' AND EXISTS (SELECT 1 FROM dealer.plan_instalments i WHERE i.plan_id = p.id AND i.due_on BETWEEN $1::date - 40 AND $1::date + ${REMIND_BEFORE_DAYS})`, [today]);
    if (!plans.length) return 0;
    const ids = plans.map((p) => p.id);
    const [inst, pays] = await Promise.all([this.instalments(ids), this.payments(ids)]);
    let sent = 0;
    for (const p of plans) {
      const rows = allocate(inst.get(p.id) ?? [], (pays.get(p.id) ?? []).reduce((n, x) => n + x.amountUgx, 0), today);
      for (const r of rows) {
        if (r.owingUgx <= 0 || r.seq === 0) continue;
        const kinds: ('before' | 'due' | 'late' | 'dealer_late')[] = [];
        const until = daysBetween(today, r.dueOn);
        if (until > 0 && until <= REMIND_BEFORE_DAYS) kinds.push('before');
        if (until === 0) kinds.push('due');
        if (until <= -LATE_TEXT_AFTER_DAYS && until > -30) kinds.push('late', 'dealer_late');
        for (const kind of kinds) {
          if (kind !== 'dealer_late' && !p.reminders) continue;
          const claimed = await this.pool.query(`INSERT INTO dealer.payment_reminders (plan_id, seq, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [p.id, r.seq, kind]);
          if (claimed.rowCount !== 1) continue;
          await this.remind(p, r, kind).catch((e: Error) => this.log.warn(`reminder not sent: ${e.message}`));
          sent += 1;
        }
      }
    }
    return sent;
  }

  private async remind(p: PlanRow, r: { seq: number; dueOn: string; owingUgx: number }, kind: 'before' | 'due' | 'late' | 'dealer_late') {
    const car = await this.car(p.organisationId, p.stockItemId);
    const dealer = await this.dealerName(p.organisationId);
    const date = new Date(`${r.dueOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const params = { dealer, amount: fmt(r.owingUgx), plate: car.plate ?? car.name, date };
    const extra = { relatedType: 'dealer_payment_plan', relatedId: p.id };
    if (kind === 'dealer_late') {
      const buyer = (await this.parties.reveal(p.partyId))?.name ?? 'The buyer';
      for (const m of await this.iam.managerPhones(p.organisationId)) {
        await this.notify.sendSmsToPhone(m.phone, 'dealer_payment_late_manager', { ...params, buyer }, 'reminder', m.userId, extra);
      }
      return;
    }
    const phone = (await this.parties.reveal(p.partyId))?.phone;
    if (!phone) return;
    const template = kind === 'before' ? 'dealer_payment_due_soon' : kind === 'due' ? 'dealer_payment_due_today' : 'dealer_payment_late';
    await this.notify.sendSmsToPhone(phone, template, params, 'reminder', null, { ...extra, toPartyId: p.partyId });
  }

  // ---------- the car's report (D-123)

  /** Yes while a dealer is still owed money on this car; "paid" once a dealer plan is fully paid; null when none. */
  private async balanceStatus(vehicleIds: string[]): Promise<'owed' | 'paid' | null> {
    const { rows } = await this.pool.query<{ owed: boolean }>(
      `SELECT p.price_ugx > COALESCE((SELECT sum(x.amount_ugx) FROM dealer.payments x WHERE x.plan_id = p.id), 0) AS owed
         FROM dealer.payment_plans p JOIN dealer.stock_items s ON s.id = p.stock_item_id
        WHERE s.vehicle_id = ANY($1) AND p.kind = 'instalments'`, [vehicleIds]);
    if (!rows.length) return null;
    return rows.some((r) => r.owed) ? 'owed' : 'paid';
  }
}
