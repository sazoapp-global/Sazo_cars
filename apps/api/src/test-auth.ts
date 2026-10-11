import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import { ConsoleEmailSender, ConsoleSmsSender } from './modules/notify/index.js';

// Tests only: the sign-up details for a made-up person from a short name ("Sarah Namukasa", "Owner").
// Real sign-ups give surname, first name, gender and an 18+ date of birth (D-101).
export function testSignup(name: string, extra: { gender?: 'male' | 'female'; dateOfBirth?: string } = {}) {
  const words = name.replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const firstName = words[0] ?? 'Test';
  const surname = words.length > 1 ? words.slice(1).join(' ') : 'Test';
  return { surname, firstName, gender: extra.gender ?? 'female', dateOfBirth: extra.dateOfBirth ?? '1990-01-15' };
}

/** Tests only: log in (or sign up, when a name is given) with a phone code, answering a second step if one is asked. */
export async function signInWithCode(app: INestApplication, http: ReturnType<typeof request>, phone: string, displayName?: string): Promise<string> {
  const sms = app.get(ConsoleSmsSender, { strict: false });
  const codeIn = (text: string | undefined) => text!.match(/\b(\d{6})\b/)![1]!;
  await http.post('/v1/auth/otp/request').send({ phone, intent: displayName ? 'signup' : 'login' }).expect(202);
  let body: Record<string, unknown> = (await http.post('/v1/auth/otp/verify').send({ phone, code: codeIn(sms.latest(phone)), ...(displayName ? { signup: testSignup(displayName) } : {}) }).expect(200)).body;
  if (body.status === 'second_step') {
    const email = app.get(ConsoleEmailSender, { strict: false });
    const code = body.channel === 'sms' ? codeIn(sms.latest(phone)) : codeIn(email.lastMessage()?.text);
    body = (await http.post('/v1/auth/second-step').send({ challengeId: body.challengeId, code, rememberDevice: false }).expect(200)).body;
  }
  return body.accessToken as string;
}
