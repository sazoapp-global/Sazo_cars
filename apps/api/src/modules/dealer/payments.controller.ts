// Dealer dashboard and payments (D-146). The dashboard is for everyone at the dealer (money only for managers);
// payments are for managers. Every call acts for one dealer: the X-Organisation-Id header.
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { tidyName, tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { DealerDashboardService } from './dashboard.service.js';
import { dealerOrg } from './dealer-access.js';
import { DealerError } from './dealer.service.js';
import { PAY_METHODS, PaymentsService, kampalaToday } from './payments.service.js';

const Uuid = z.string().uuid();
const Money = z.number().int().positive().max(100_000_000_000);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date (YYYY-MM-DD)').refine((d) => !Number.isNaN(Date.parse(d)), 'not a date');
const Method = z.enum(PAY_METHODS as [string, ...string[]]) as z.ZodType<(typeof PAY_METHODS)[number]>;

const Plan = z.object({
  buyer: z.union([
    z.object({ leadId: Uuid }).strict(),
    z.object({ name: z.string().trim().min(2).max(80).transform(tidyName), phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'a phone number in international form, e.g. +256772123456') }).strict(),
  ]),
  kind: z.enum(['cash', 'instalments']),
  depositUgx: z.number().int().min(0).max(100_000_000_000).optional(),
  months: z.number().int().min(1).max(120).optional(),
  firstDueOn: Day.optional(),
  amounts: z.array(Money).min(1).max(120).optional(),
  reminders: z.boolean().default(true),
  paidAtSale: z.object({ method: Method, reference: z.string().trim().max(80).optional() }).optional(),
}).strict().superRefine((p, ctx) => {
  if (p.kind === 'instalments' && (!p.months || !p.firstDueOn)) ctx.addIssue({ code: 'custom', path: ['months'], message: 'Instalments need the number of months and the first due date' });
});
const Payment = z.object({
  amountUgx: Money,
  method: Method,
  paidOn: Day.refine((d) => d <= kampalaToday(), 'cannot be in the future'),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).transform(tidySentence).optional(),
}).strict();

const STATUS: Record<string, number> = {
  not_sold: 409, plan_not_found: 404, plan_exists: 409, plan_invalid: 400, lead_not_found: 404, fully_paid: 409, more_than_owed: 400,
  payment_not_found: 404, already_corrected: 409, stock_not_found: 404,
};
const TITLE: Record<number, string> = { 400: 'Invalid request', 404: 'Not found', 409: 'Conflict' };

function problem(err: unknown): never {
  if (err instanceof DealerError) {
    const status = STATUS[err.code] ?? 422;
    throw new Problem(status, err.code, TITLE[status] ?? 'Unprocessable', err.message);
  }
  throw err;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', b.error.issues[0]?.message ?? 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return b.data;
}

const id = (v: string, code: 'plan_not_found' | 'stock_not_found' | 'payment_not_found') => {
  if (!Uuid.safeParse(v).success) problem(new DealerError(code, 'Not found'));
  return v;
};

@Controller('dealer')
export class DealerPaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(DealerDashboardService) private readonly dashboards: DealerDashboardService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** Managers only (money). Recording payments is for approved dealers: a sale needs approval. */
  private manager(actor: Actor, orgId: string | undefined) {
    return dealerOrg(this.iam, actor, orgId, 'dealer.costs.manage');
  }

  /** GET /v1/dealer/dashboard: cards and monthly sales. Money for managers only. */
  @Get('dashboard')
  async dashboard(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined) {
    const org = await dealerOrg(this.iam, actor, orgId, 'dealer.stock.manage', { beforeApproval: true });
    const manager = canForOrg(actor, org, 'dealer.costs.manage', { beforeApproval: true }).ok;
    return this.dashboards.summary(org, actor.userId, manager);
  }

  /**
   * GET /v1/dealer/payments?show=owing|due|late|paid|all&within=7|14|30&sort=due|late|balance|sold. `due` = not late and
   * the next payment falls due within `within` days (7 by default). Sorted by next due date unless asked otherwise.
   */
  @Get('payments')
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query() query: Record<string, string>) {
    const org = await this.manager(actor, orgId);
    const q = z.object({
      show: z.enum(['owing', 'due', 'late', 'paid', 'all']).default('all'),
      within: z.coerce.number().int().min(1).max(90).optional(),
      sort: z.enum(['due', 'late', 'balance', 'sold']).optional(),
    }).safeParse(query);
    if (!q.success) throw badRequest('invalid_query', 'show is owing, due, late, paid or all; sort is due, late, balance or sold; within is a number of days');
    return this.payments.list(org, q.data.show, kampalaToday(), { within: q.data.within, sort: q.data.sort });
  }

  /** POST /v1/dealer/stock/:id/payment-plan: how a sold car is paid for (cash, or deposit and monthly instalments). */
  @Post('stock/:id/payment-plan')
  @HttpCode(201)
  async createPlan(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') stockId: string, @Body() body: unknown) {
    const org = await this.manager(actor, orgId);
    const planId = await this.payments.createPlan(actor, org, id(stockId, 'stock_not_found'), parse(Plan, body)).catch(problem);
    return this.payments.detail(org, planId);
  }

  /** GET /v1/dealer/payments/:planId: the plan, each payment's status, payments received, the buyer. */
  @Get('payments/:planId')
  async detail(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('planId') planId: string) {
    const org = await this.manager(actor, orgId);
    return this.payments.detail(org, id(planId, 'plan_not_found')).catch(problem);
  }

  /** POST /v1/dealer/payments/:planId/payments: a payment received; the buyer gets an SMS receipt. */
  @Post('payments/:planId/payments')
  @HttpCode(201)
  async pay(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('planId') planId: string, @Body() body: unknown) {
    const org = await this.manager(actor, orgId);
    return this.payments.recordPayment(actor, org, id(planId, 'plan_not_found'), parse(Payment, body)).catch(problem);
  }

  /** POST /v1/dealer/payments/:planId/payments/:paymentId/correct { reason }: take a mistaken payment back off. */
  @Post('payments/:planId/payments/:paymentId/correct')
  @HttpCode(201)
  async correct(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('planId') planId: string, @Param('paymentId') paymentId: string, @Body() body: unknown) {
    const org = await this.manager(actor, orgId);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200).transform(tidySentence) }).strict(), body);
    return this.payments.correctPayment(actor, org, id(planId, 'plan_not_found'), id(paymentId, 'payment_not_found'), reason).catch(problem);
  }

  /** GET /v1/dealer/payments/:planId/receipts/:paymentId: one payment, for its printed receipt. */
  @Get('payments/:planId/receipts/:paymentId')
  async receipt(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('planId') planId: string, @Param('paymentId') paymentId: string) {
    const org = await this.manager(actor, orgId);
    return this.payments.receipt(org, id(planId, 'plan_not_found'), id(paymentId, 'payment_not_found')).catch(problem);
  }
}
