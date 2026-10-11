// Email delivery behind one small interface (like SMS): printed locally, AWS SES in production (D-105).
import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage { to: string; subject: string; text: string }
export interface EmailResult { provider: string; ok: boolean; providerMessageId?: string; error?: string }
export interface EmailSender { send(m: EmailMessage): Promise<EmailResult> }

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** Development/test sender: prints the email in the API window and keeps it so a test can read the link. */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly log = new Logger('Email');
  private readonly inbox: (EmailMessage & { at: Date })[] = [];

  async send(m: EmailMessage): Promise<EmailResult> {
    this.inbox.push({ ...m, at: new Date() });
    if (this.inbox.length > 500) this.inbox.shift();
    this.log.log(`(dev) Email to ${m.to}: ${m.subject}\n${m.text}`);
    return { provider: 'console', ok: true, providerMessageId: `console-${this.inbox.length}` };
  }

  /** The last email sent to anyone (dev/test only). */
  lastMessage(): EmailMessage | undefined {
    return this.inbox.at(-1);
  }

  /** Latest email to an address (dev/test only). */
  latest(to: string): EmailMessage | undefined {
    return [...this.inbox].reverse().find((m) => m.to === to.toLowerCase());
  }
}

/** AWS Simple Email Service (v2 API). The sending address/domain must be verified in SES first. */
export class SesEmailSender implements EmailSender {
  private client?: { send(cmd: unknown): Promise<{ MessageId?: string }> };
  constructor(private readonly cfg: { from: string; region?: string }) {}

  async send(m: EmailMessage): Promise<EmailResult> {
    try {
      const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
      this.client ??= new SESv2Client(this.cfg.region ? { region: this.cfg.region } : {}) as never;
      const out = await this.client!.send(new SendEmailCommand({
        FromEmailAddress: this.cfg.from,
        Destination: { ToAddresses: [m.to] },
        Content: { Simple: { Subject: { Data: m.subject, Charset: 'UTF-8' }, Body: { Text: { Data: m.text, Charset: 'UTF-8' } } } },
      }));
      return { provider: 'ses', ok: true, ...(out.MessageId ? { providerMessageId: out.MessageId } : {}) };
    } catch (err) {
      return { provider: 'ses', ok: false, error: (err as Error).message };
    }
  }
}
