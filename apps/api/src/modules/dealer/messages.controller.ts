// Messages API (D-173). The dealer's side acts for one dealer (the X-Organisation-Id header) and needs the
// stock permission there (managers and sales staff); the broker's side needs the broker role.
import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { CurrentActor, IamService, RequirePermission, type Actor } from '../iam/index.js';
import { dealerOrg } from './dealer-access.js';
import { MessagesError, MessagesService } from './messages.service.js';

const Uuid = z.string().uuid();
const Message = z.object({
  body: z.string().trim().min(1, 'Write a message').max(2000),
  stockId: Uuid.optional(),
}).strict();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
  return b.data;
}
function id(v: string, allowTeam = false): string {
  if ((allowTeam && v === 'team') || Uuid.safeParse(v).success) return v;
  throw new Problem(404, 'conversation_not_found', 'Not found', 'This conversation was not found');
}
async function handle<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (err) {
    if (err instanceof MessagesError) {
      const status = ({ conversation_not_found: 404, dealer_not_open: 404, car_not_allowed: 422, not_approved: 403, person_left: 422, not_on_team: 422 } as const)[err.code];
      throw new Problem(status, err.code, ({ 404: 'Not found', 422: 'Unprocessable', 403: 'Forbidden' } as const)[status], err.message);
    }
    throw err;
  }
}

@Controller('dealer/messages')
export class DealerMessagesController {
  constructor(@Inject(MessagesService) private readonly messages: MessagesService, @Inject(IamService) private readonly iam: IamService) {}
  /** Messages are the team's own work, so they open while the dealer waits for approval (team only until then). */
  private org = (actor: Actor, orgId: string | undefined) => dealerOrg(this.iam, actor, orgId, 'dealer.stock.manage', { beforeApproval: true });

  /** GET /v1/dealer/messages: the team's conversation and each broker's, newest first. */
  @Get()
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId?: string) {
    const org = await this.org(actor, orgId);
    return { items: await this.messages.dealerList(actor, org) };
  }

  /** GET /v1/dealer/messages/unread: the side bar's count. */
  @Get('unread')
  async unread(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId?: string) {
    return { unread: await this.messages.dealerUnread(actor, await this.org(actor, orgId)) };
  }

  /** GET /v1/dealer/messages/people: New chat (D-177), the other members of the team. */
  @Get('people')
  async people(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId?: string) {
    return this.messages.dealerPeople(actor, await this.org(actor, orgId));
  }

  /** POST /v1/dealer/messages/direct { userId }: open (or reopen) a private chat with a member of the team. */
  @Post('direct')
  async direct(@CurrentActor() actor: Actor, @Body() body: unknown, @Headers('x-organisation-id') orgId?: string) {
    const org = await this.org(actor, orgId);
    const b = parse(z.object({ userId: Uuid }).strict(), body);
    return handle(() => this.messages.dealerStartDirect(actor, org, b.userId));
  }

  /** GET /v1/dealer/messages/:id (or "team"): one conversation; opening it marks it read. */
  @Get(':id')
  async thread(@CurrentActor() actor: Actor, @Param('id') convId: string, @Headers('x-organisation-id') orgId?: string) {
    const org = await this.org(actor, orgId);
    return handle(() => this.messages.dealerThread(actor, org, id(convId, true)));
  }

  /** POST /v1/dealer/messages/:id { body, stockId? }: write in a conversation. */
  @Post(':id')
  async send(@CurrentActor() actor: Actor, @Param('id') convId: string, @Body() body: unknown, @Headers('x-organisation-id') orgId?: string) {
    const org = await this.org(actor, orgId);
    const m = parse(Message, body);
    return handle(() => this.messages.dealerSend(actor, org, id(convId, true), m.body, m.stockId));
  }
}

@Controller('broker/messages')
export class BrokerMessagesController {
  constructor(@Inject(MessagesService) private readonly messages: MessagesService) {}

  /** GET /v1/broker/messages: the broker's conversations, and the dealers they may write to. */
  @Get()
  @RequirePermission('broker.access')
  async list(@CurrentActor() actor: Actor) {
    return this.messages.brokerList(actor);
  }

  @Get('unread')
  @RequirePermission('broker.access')
  async unread(@CurrentActor() actor: Actor) {
    return { unread: await this.messages.brokerUnread(actor) };
  }

  /** GET /v1/broker/messages/:organisationId: the conversation with one dealer; opening it marks it read. */
  @Get(':org')
  @RequirePermission('broker.access')
  async thread(@CurrentActor() actor: Actor, @Param('org') org: string) {
    return handle(() => this.messages.brokerThread(actor, id(org)));
  }

  /** POST /v1/broker/messages/:organisationId { body, stockId? }: write to a dealer. */
  @Post(':org')
  @RequirePermission('broker.access')
  async send(@CurrentActor() actor: Actor, @Param('org') org: string, @Body() body: unknown) {
    const m = parse(Message, body);
    return handle(() => this.messages.brokerSend(actor, id(org), m.body, m.stockId));
  }
}
