// Help API: the bell (announcements for me), the help page (FAQs for me) and, for SAZO staff with the right
// permission, sending announcements and writing FAQs (A-06, A-07).
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, Public, RequirePermission, type Actor } from '../iam/index.js';
import { AUDIENCES, FAQ_STATUSES, HelpError, HelpService, audiencesOf } from './help.service.js';

const Uuid = z.string().uuid();
const Announcement = z.object({
  audience: z.enum(AUDIENCES),
  title: z.string().trim().min(3).max(120).transform(tidySentence),
  body: z.string().trim().min(3).max(2000),
}).strict();
const Faq = z.object({
  audience: z.enum(AUDIENCES),
  topic: z.string().trim().min(2).max(60).transform(tidySentence),
  question: z.string().trim().min(5).max(200).transform(tidySentence),
  answer: z.string().trim().min(5).max(3000),
  status: z.enum(FAQ_STATUSES).default('draft'),
  position: z.number().int().min(0).max(10000).default(100),
}).strict();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', b.error.issues[0]?.message ?? 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return b.data;
}
function problem(err: unknown): never {
  if (err instanceof HelpError) throw err.code === 'already_withdrawn' ? new Problem(409, err.code, 'Conflict', err.message) : notFound(err.code, err.message);
  throw err;
}
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

@Controller()
export class HelpController {
  constructor(@Inject(HelpService) private readonly help: HelpService) {}

  /** GET /v1/me/announcements: the bell. */
  @Get('me/announcements')
  async mine(@CurrentActor() actor: Actor) {
    const items = await this.help.mine(actor);
    return { unread: items.filter((a) => !a.read).length, items: items.map((a) => ({ id: a.id, audience: a.audience, title: a.title, body: a.body, createdAt: iso(a.createdAt), read: !!a.read })) };
  }

  /** POST /v1/me/announcements/read { ids }: mark as read. */
  @Post('me/announcements/read')
  @HttpCode(204)
  async read(@CurrentActor() actor: Actor, @Body() body: unknown) {
    await this.help.markRead(actor, parse(z.object({ ids: z.array(Uuid).max(50) }), body).ids);
  }

  /** GET /v1/help/faqs: published questions for everyone (signed out), or for my groups (signed in). */
  @Get('help/faqs')
  @Public()
  async faqs(@CurrentActor() actor: Actor | undefined) {
    const rows = await this.help.faqsFor(actor ? audiencesOf(actor) : ['everyone', 'buyers']);
    return { items: rows.map((f) => ({ id: f.id, topic: f.topic, question: f.question, answer: f.answer })) };
  }

  // Staff ---------------------------------------------------------------------------------------------

  @Get('admin/announcements')
  @RequirePermission('announcement.manage')
  async allAnnouncements() {
    return { items: (await this.help.allAnnouncements()).map((a) => ({ ...a, createdAt: iso(a.createdAt), withdrawnAt: iso(a.withdrawnAt) })) };
  }

  @Post('admin/announcements')
  @RequirePermission('announcement.manage')
  async announce(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const a = await this.help.announce(actor, parse(Announcement, body));
    return { ...a, createdAt: iso(a.createdAt), withdrawnAt: null };
  }

  @Post('admin/announcements/:id/withdraw')
  @HttpCode(204)
  @RequirePermission('announcement.manage')
  async withdraw(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!Uuid.safeParse(id).success) throw notFound('announcement_not_found', 'No such announcement');
    await this.help.withdraw(actor, id).catch(problem);
  }

  @Get('admin/faqs')
  @RequirePermission('faq.manage')
  async allFaqs() {
    return { items: (await this.help.allFaqs()).map((f) => ({ ...f, updatedAt: iso(f.updatedAt) })) };
  }

  @Post('admin/faqs')
  @RequirePermission('faq.manage')
  async createFaq(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const f = await this.help.createFaq(actor, parse(Faq, body));
    return { ...f, updatedAt: iso(f.updatedAt) };
  }

  @Patch('admin/faqs/:id')
  @RequirePermission('faq.manage')
  async updateFaq(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    if (!Uuid.safeParse(id).success) throw notFound('faq_not_found', 'No such question');
    const f = await this.help.updateFaq(actor, id, parse(Faq.partial().strict(), body)).catch(problem);
    return { ...f, updatedAt: iso(f.updatedAt) };
  }

  @Get('admin/faqs/:id/changes')
  @RequirePermission('faq.manage')
  async changes(@Param('id') id: string) {
    if (!Uuid.safeParse(id).success) throw notFound('faq_not_found', 'No such question');
    return { items: (await this.help.faqChanges(id)).map((c) => ({ ...c, changedAt: iso(c.changedAt) })) };
  }
}
