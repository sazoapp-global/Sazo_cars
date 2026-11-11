// Messages in the dealer system (D-173, 11 Nov 2026).
//
// Who may read and write, checked on every call:
//   • the dealer's side: active members of an approved dealer with the stock permission (managers and sales
//     staff). They all see the team's conversation and every broker's conversation with the dealer. Staff who
//     leave the team lose access at once; a dealer waiting for approval has only its team conversation.
//   • a broker (the broker role): only their own conversation with each dealer. They may start one only with an
//     approved dealer that has at least one car open to brokers.
//   • a private chat (D-177): two members of the team, and no one else, not even other managers. Either may start
//     it; a pair has one. When one leaves the team the chat stays for the other, closed to new messages.
// A message may carry one of the dealer's cars: any car in stock in the team's conversation and in a private
// chat; with a broker, only a car the dealer has opened to brokers.
import { Inject, Injectable } from '@nestjs/common';
import { tidySentence } from '@sazo/contracts';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import pg from 'pg';
import { IamService, type Actor } from '../iam/index.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerService } from './dealer.service.js';
import { MessagesRepository, type ConversationRow, type ConversationSummary, type MessageRow } from './messages.repository.js';

export type MessagesErrorCode = 'conversation_not_found' | 'dealer_not_open' | 'car_not_allowed' | 'not_approved' | 'person_left' | 'not_on_team';
export class MessagesError extends Error {
  constructor(readonly code: MessagesErrorCode, message: string) { super(message); }
}

/** How a person shows in a conversation: their name and what they do. */
const ROLE_LABEL: Record<string, string> = { org_manager: 'Manager', org_staff: 'Sales' };

export interface CarCard { stockId: string; name: string; category: string | null; kind: string | null; askingPriceUgx: number; photoId: string | null; inStock: boolean }

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(MessagesRepository) private readonly repo: MessagesRepository,
    @Inject(DealerRepository) private readonly stock: DealerRepository,
    @Inject(DealerService) private readonly dealer: DealerService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  // The dealer's side ---------------------------------------------------------------------------------------

  /** The dealer's conversations: the team's first time round, then each broker's, newest first. */
  async dealerList(actor: Actor, organisationId: string) {
    const org = await this.iam.organisation(organisationId);
    await this.repo.teamConversation(organisationId);
    const rows = (await this.repo.forDealer(organisationId, actor.userId)).filter((c) => c.kind !== 'broker' || org?.status === 'approved');
    return this.summaries(rows, actor, org?.tradingName ?? org?.legalName ?? '');
  }

  async dealerUnread(actor: Actor, organisationId: string): Promise<number> {
    const org = await this.iam.organisation(organisationId);
    return (await this.repo.forDealer(organisationId, actor.userId)).filter((c) => c.kind !== 'broker' || org?.status === 'approved').reduce((n, c) => n + c.unread, 0);
  }

  /** New chat (D-177): the team's chat and each other member of the team, with the private chat if there is one. */
  async dealerPeople(actor: Actor, organisationId: string) {
    const team = await this.teamMembers(organisationId);
    const mine = (await this.repo.forDealer(organisationId, actor.userId)).filter((c) => c.kind === 'direct');
    const chatWith = new Map(mine.map((c) => [c.memberA === actor.userId ? c.memberB! : c.memberA!, c.id]));
    return {
      teamSize: team.length,
      people: team.filter((m) => m.userId !== actor.userId).map((m) => ({ ...m, conversationId: chatWith.get(m.userId) ?? null })),
    };
  }

  /** Opens (or reopens) a private chat with another member of the team. */
  async dealerStartDirect(actor: Actor, organisationId: string, userId: string) {
    const team = await this.teamMembers(organisationId);
    if (userId === actor.userId || !team.some((m) => m.userId === userId) || !team.some((m) => m.userId === actor.userId)) {
      throw new MessagesError('not_on_team', 'Choose someone on your team');
    }
    return { conversationId: (await this.repo.openDirect(organisationId, actor.userId, userId)).id };
  }

  /** One conversation, opened by a member of the dealer's team. Opening it marks it read. */
  async dealerThread(actor: Actor, organisationId: string, conversationId: string) {
    const c = await this.dealerConversation(actor, organisationId, conversationId);
    return this.thread(actor, c);
  }

  async dealerSend(actor: Actor, organisationId: string, conversationId: string, body: string, stockId?: string) {
    const c = await this.dealerConversation(actor, organisationId, conversationId);
    if (c.kind === 'direct') {
      const other = c.memberA === actor.userId ? c.memberB! : c.memberA!;
      if (!(await this.teamMembers(organisationId)).some((m) => m.userId === other)) {
        const name = (await this.iam.displayNames([other])).get(other) ?? 'This person';
        throw new MessagesError('person_left', `${name} has left the team, so this chat is closed`);
      }
    }
    if (stockId) await this.allowedCar(c, stockId);
    return this.send(actor, c, body, stockId);
  }

  private async dealerConversation(actor: Actor, organisationId: string, id: string): Promise<ConversationRow> {
    const c = id === 'team' ? await this.repo.teamConversation(organisationId) : await this.repo.conversation(id);
    // A private chat is only for its two people: to anyone else it does not exist.
    if (!c || c.organisationId !== organisationId || (c.kind === 'direct' && actor.userId !== c.memberA && actor.userId !== c.memberB)) {
      throw new MessagesError('conversation_not_found', 'This conversation was not found');
    }
    if (c.kind === 'broker' && (await this.iam.organisation(organisationId))?.status !== 'approved') {
      throw new MessagesError('not_approved', 'Brokers can write to you once SAZO has approved your business');
    }
    return c;
  }

  // The broker's side ---------------------------------------------------------------------------------------

  /** The broker's conversations, newest first, then the dealers they may start one with. */
  async brokerList(actor: Actor) {
    const rows = await this.repo.forBroker(actor.userId);
    const open = await this.dealersOpenToBrokers();
    const started = new Set(rows.map((r) => r.organisationId));
    const conversations = await this.summaries(rows, actor);
    const dealers = await Promise.all(open.filter((id) => !started.has(id)).map(async (id) => {
      const o = await this.iam.organisation(id);
      return { organisationId: id, name: o?.tradingName ?? o?.legalName ?? '', district: o?.district ?? null };
    }));
    return { conversations, dealers: dealers.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  async brokerUnread(actor: Actor): Promise<number> {
    return (await this.repo.forBroker(actor.userId)).reduce((n, c) => n + c.unread, 0);
  }

  /** The broker's conversation with one dealer (empty until the first message). */
  async brokerThread(actor: Actor, organisationId: string) {
    await this.writableDealer(organisationId, actor.userId);
    const c = await this.repo.brokerConversation(organisationId, actor.userId);
    if (c) return this.thread(actor, c);
    const o = await this.iam.organisation(organisationId);
    const team = (await this.teamMembers(organisationId)).map((m) => ({ ...m, you: false }));
    const me = (await this.iam.displayNames([actor.userId])).get(actor.userId) ?? '';
    return { conversationId: null, kind: 'broker' as const, organisationId, title: o?.tradingName ?? o?.legalName ?? '', members: team,
      people: [{ userId: actor.userId, name: me, role: 'Broker', you: true }, ...team], messages: [], seenBy: [] };
  }

  async brokerSend(actor: Actor, organisationId: string, body: string, stockId?: string) {
    await this.writableDealer(organisationId, actor.userId);
    const c = await this.repo.openBrokerConversation(organisationId, actor.userId);
    if (stockId) await this.allowedCar(c, stockId);
    return this.send(actor, c, body, stockId);
  }

  /** A broker may write to an approved dealer with cars open to brokers, or keep a conversation they already have with an approved dealer. */
  private async writableDealer(organisationId: string, brokerUserId: string) {
    const o = await this.iam.organisation(organisationId);
    if (!o || o.type !== 'dealer' || o.status !== 'approved') throw new MessagesError('dealer_not_open', 'This dealer is not taking messages from brokers');
    if (await this.repo.brokerConversation(organisationId, brokerUserId)) return;
    if (!(await this.dealersOpenToBrokers()).includes(organisationId)) throw new MessagesError('dealer_not_open', 'This dealer has no cars open to brokers');
  }

  // Shared --------------------------------------------------------------------------------------------------

  /** Approved dealers with at least one car open to brokers: the dealers a broker may write to. */
  private async dealersOpenToBrokers(): Promise<string[]> {
    const ids = await this.repo.dealersWithCarsOpenToBrokers();
    const orgs = await Promise.all(ids.map((id) => this.iam.organisation(id)));
    return ids.filter((_, i) => orgs[i]?.type === 'dealer' && orgs[i]?.status === 'approved');
  }

  private async allowedCar(c: ConversationRow, stockId: string) {
    const car = await this.stock.get(stockId);
    const ok = car && car.organisationId === c.organisationId && car.status === 'in_stock'
      && (c.kind !== 'broker' || (car.openToBrokers && !!car.commissionKind && !!car.vehicleId));
    if (!ok) throw new MessagesError('car_not_allowed', c.kind !== 'broker' ? 'Choose one of your cars for sale' : 'Choose a car this dealer has opened to brokers');
  }

  private async send(actor: Actor, c: ConversationRow, body: string, stockId?: string) {
    const text = tidySentence(body.trim());
    const m = await withTx(this.pool, (tx) => this.repo.add(tx, { conversationId: c.id, senderUserId: actor.userId, body: text, stockItemId: stockId ?? null }));
    return { messageId: m.id, conversationId: c.id, createdAt: m.createdAt.toISOString() };
  }

  /** The dealer's managers and sales staff, as a conversation shows them. */
  private async teamMembers(organisationId: string) {
    return (await this.iam.listMembers(organisationId)).filter((m) => m.status === 'active' && ROLE_LABEL[m.role])
      .map((m) => ({ userId: m.userId, name: m.displayName, role: ROLE_LABEL[m.role]! }));
  }

  private async thread(actor: Actor, c: ConversationRow) {
    const [rows, team, o] = await Promise.all([this.repo.messages(c.id), this.teamMembers(c.organisationId), this.iam.organisation(c.organisationId)]);
    await this.repo.markRead(c.id, actor.userId);
    const reads = await this.repo.reads(c.id);
    const brokerName = c.brokerUserId ? (await this.iam.displayNames([c.brokerUserId])).get(c.brokerUserId) ?? 'Broker' : null;
    const people = new Map<string, { name: string; role: string }>(team.map((m) => [m.userId, { name: m.name, role: m.role }]));
    if (c.brokerUserId) people.set(c.brokerUserId, { name: brokerName!, role: 'Broker' });
    const unknown = rows.map((m) => m.senderUserId).filter((id) => !people.has(id));
    if (unknown.length) for (const [id, name] of await this.iam.displayNames(unknown)) people.set(id, { name, role: 'Left the team' });
    const cards = await this.cards(rows.map((m) => m.stockItemId).filter((s): s is string => !!s));
    const seenAt = (m: MessageRow) => reads.some((r) => r.userId !== m.senderUserId && r.lastReadAt >= m.createdAt);
    const last = rows.at(-1);
    const dealerName = o?.tradingName ?? o?.legalName ?? '';
    if (c.kind === 'direct') {
      // Only the two of them; one who has left the team shows as "Left the team" and the chat is closed.
      const pair = [c.memberA!, c.memberB!];
      const names = await this.iam.displayNames(pair.filter((id) => !people.has(id)));
      for (const [id, name] of names) people.set(id, { name, role: 'Left the team' });
      const other = pair.find((id) => id !== actor.userId)!;
      const pairPeople = pair.map((id) => ({ userId: id, ...(people.get(id) ?? { name: 'Someone', role: '' }), you: id === actor.userId }))
        .sort((a, b) => Number(a.you) - Number(b.you));
      return {
        conversationId: c.id, kind: c.kind, organisationId: c.organisationId, title: people.get(other)?.name ?? 'Someone',
        role: people.get(other)?.role ?? '', closed: !team.some((m) => m.userId === other),
        members: pairPeople, people: pairPeople,
        messages: rows.map((m) => ({
          id: m.id, mine: m.senderUserId === actor.userId, sender: people.get(m.senderUserId) ?? { name: 'Someone', role: '' },
          body: m.body, car: m.stockItemId ? cards.get(m.stockItemId) ?? null : null, createdAt: m.createdAt.toISOString(), seen: seenAt(m),
        })),
        seenBy: last ? reads.filter((r) => r.userId !== last.senderUserId && r.lastReadAt >= last.createdAt).map((r) => ({ name: people.get(r.userId)?.name ?? '', you: r.userId === actor.userId })) : [],
      };
    }
    return {
      conversationId: c.id, kind: c.kind, organisationId: c.organisationId,
      title: c.kind === 'team' ? `${dealerName} team` : actor.userId === c.brokerUserId ? dealerName : brokerName!,
      /** The dealer's team (managers and sales staff); "you" marks the reader. */
      members: team.map((m) => ({ ...m, you: m.userId === actor.userId })),
      /** Everyone in the chat, for its details: the broker first in a broker's chat, then the team. */
      people: [
        ...(c.brokerUserId ? [{ userId: c.brokerUserId, name: brokerName!, role: 'Broker', you: c.brokerUserId === actor.userId }] : []),
        ...team.map((m) => ({ ...m, you: m.userId === actor.userId })),
      ],
      messages: rows.map((m) => ({
        id: m.id, mine: m.senderUserId === actor.userId, sender: people.get(m.senderUserId) ?? { name: 'Someone', role: '' },
        body: m.body, car: m.stockItemId ? cards.get(m.stockItemId) ?? null : null, createdAt: m.createdAt.toISOString(), seen: seenAt(m),
      })),
      /** Who has read the latest message, besides its sender. */
      seenBy: last ? reads.filter((r) => r.userId !== last.senderUserId && r.lastReadAt >= last.createdAt).map((r) => ({ name: people.get(r.userId)?.name ?? '', you: r.userId === actor.userId })) : [],
    };
  }

  private async summaries(rows: ConversationSummary[], actor: Actor, dealerName?: string) {
    const names = await this.iam.displayNames(rows.flatMap((r) => [r.brokerUserId, r.lastSenderId, r.memberA, r.memberB]).filter((x): x is string => !!x));
    const team = new Map((dealerName !== undefined && rows[0] ? await this.teamMembers(rows[0].organisationId) : []).map((m) => [m.userId, m.role]));
    const orgs = new Map<string, string>();
    for (const id of new Set(rows.map((r) => r.organisationId))) {
      const o = await this.iam.organisation(id);
      orgs.set(id, o?.tradingName ?? o?.legalName ?? '');
    }
    return rows.map((r) => ({
      conversationId: r.id, kind: r.kind, organisationId: r.organisationId,
      title: r.kind === 'team' ? `${dealerName ?? orgs.get(r.organisationId)} team`
        : r.kind === 'direct' ? names.get(r.memberA === actor.userId ? r.memberB! : r.memberA!) ?? 'Someone'
        : actor.userId === r.brokerUserId ? orgs.get(r.organisationId)! : names.get(r.brokerUserId!) ?? 'Broker',
      ...(r.kind === 'direct' ? { role: team.get(r.memberA === actor.userId ? r.memberB! : r.memberA!) ?? 'Left the team' } : {}),
      last: r.lastAt ? { body: r.lastBody!, hasCar: !!r.lastStockId, sender: r.lastSenderId === actor.userId ? 'You' : names.get(r.lastSenderId!) ?? '', at: r.lastAt.toISOString() } : null,
      unread: r.unread,
    }));
  }

  private async cards(stockIds: string[]): Promise<Map<string, CarCard>> {
    const out = new Map<string, CarCard>();
    for (const id of new Set(stockIds)) {
      const r = await this.stock.get(id);
      if (!r) continue;
      const v = await this.dealer.view(r);
      const make = v.vehicle?.make ?? v.details.make; const model = v.vehicle?.model ?? v.details.model; const year = v.vehicle?.year ?? v.details.modelYear;
      out.set(id, {
        stockId: id, name: [year, make, model].filter(Boolean).join(' ') || 'A car', category: v.details.category, kind: v.details.kind,
        askingPriceUgx: r.askingPriceUgx, photoId: v.photos[0]?.photoId ?? null, inStock: r.status === 'in_stock',
      });
    }
    return out;
  }
}
