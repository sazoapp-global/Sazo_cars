// Two-way SMS (C-02): the SMS provider forwards replies to SAZO's number here. Africa's Talking posts
// form fields (from, to, text, date, id, linkId) with no signature, so the address carries a long secret
// key and anything without it gets a plain 404 — the endpoint doesn't exist as far as others can tell.
import { createHash, timingSafeEqual } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { notFound } from '../../platform/problem.js';
import { Public } from '../iam/index.js';
import { GarageService } from './garage.service.js';

const Inbound = z.object({
  from: z.string().trim().transform((s) => (s.startsWith('+') ? s : `+${s}`)).pipe(z.string().regex(/^\+\d{9,15}$/)),
  text: z.string().max(1000).default(''),
  id: z.string().max(200).optional(),
});

const digest = (s: string) => createHash('sha256').update(s).digest();

@Controller('webhooks/sms')
export class SmsWebhookController {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(GarageService) private readonly garage: GarageService,
  ) {}

  /** POST /v1/webhooks/sms/inbound?key=… — a reply from a customer's phone (operationId smsInboundWebhook). */
  @Public()
  @Post('inbound')
  @HttpCode(200)
  async inbound(@Query('key') key: unknown, @Body() body: unknown): Promise<{ ok: true }> {
    const expected = this.cfg.SMS_INBOUND_KEY;
    if (!expected || typeof key !== 'string' || !timingSafeEqual(digest(key), digest(expected))) throw notFound('not_found', 'Not found');
    const m = Inbound.safeParse(body);
    // Always 200 to the provider for well-keyed calls, even when the message is unusable, so it doesn't retry forever.
    if (m.success) await this.garage.handleSmsReply(m.data.from, m.data.text, m.data.id);
    return { ok: true };
  }
}
