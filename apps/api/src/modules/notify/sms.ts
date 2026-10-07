// SMS delivery behind one small interface, so the provider can change without touching callers.
import { Injectable, Logger } from '@nestjs/common';

export interface SmsResult {
  provider: string;
  providerMessageId?: string;
  ok: boolean;
  error?: string;
}

export interface SmsSender {
  send(toE164: string, text: string): Promise<SmsResult>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Development/test sender: keeps messages in memory so a developer (or a test) can read the code. */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly log = new Logger('SMS');
  private readonly inbox: { to: string; text: string; at: Date }[] = [];

  async send(to: string, text: string): Promise<SmsResult> {
    this.inbox.push({ to, text, at: new Date() });
    if (this.inbox.length > 500) this.inbox.shift();
    this.log.log(`(dev) SMS to ${to.slice(0, 7)}…: ${text}`);
    return { provider: 'console', ok: true, providerMessageId: `console-${this.inbox.length}` };
  }

  /** Latest message to a number (dev/test only). */
  latest(to: string): string | undefined {
    return [...this.inbox].reverse().find((m) => m.to === to)?.text;
  }
}

/**
 * Africa's Talking SMS (East Africa). Endpoint and fields follow their bulk SMS API
 * (POST /version1/messaging, form-encoded username/to/message/from, header apiKey).
 * Verify against the provider's current documentation before going live.
 */
export class AfricasTalkingSmsSender implements SmsSender {
  constructor(private readonly cfg: { username: string; apiKey: string; senderId?: string; sandbox: boolean }) {}

  async send(to: string, text: string): Promise<SmsResult> {
    const host = this.cfg.sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const body = new URLSearchParams({ username: this.cfg.username, to, message: text, ...(this.cfg.senderId ? { from: this.cfg.senderId } : {}) });
    try {
      const res = await fetch(`${host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.cfg.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as { SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] } };
      const r = json.SMSMessageData?.Recipients?.[0];
      const ok = res.ok && r?.status === 'Success';
      return { provider: 'africastalking', ok, ...(r?.messageId ? { providerMessageId: r.messageId } : {}), ...(ok ? {} : { error: r?.status ?? `HTTP ${res.status}` }) };
    } catch (err) {
      return { provider: 'africastalking', ok: false, error: (err as Error).message };
    }
  }
}
