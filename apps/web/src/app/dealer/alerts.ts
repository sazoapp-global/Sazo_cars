// The dealer's alerts (D-153, 4 Nov 2026): everything in the business that needs someone, worst first. Each alert
// opens beside the list with what is wrong and where to fix it (the fix itself where the console can do it there).
// Colours as agreed for alerts (D-111): red = act now, yellow = check soon, green "All clear" when there is nothing.
// Built from what the console already holds; nothing is stored, so an alert goes away by itself once dealt with.
// Money alerts are for managers only (D-146): the payments list refuses everyone else.
import { QUESTION_TITLES, formatDate, formatUgx, headline } from '@sazo/contracts';
import { cache } from 'react';
import type { IconName } from '@/components/icon';
import { api } from '@/lib/api';
import { localPhone } from '@/lib/phone';
import type { StockItem } from '@/lib/types';
import { CUSTOMS, carName } from './labels';

export type AlertTone = 'red' | 'yellow';
export type AlertKind = 'finding' | 'bond' | 'late' | 'age' | 'due' | 'enquiry';
export interface DealerAlert {
  /** Stable while the problem lasts: the kind and the car, sale or enquiry it is about. */
  id: string; kind: AlertKind; tone: AlertTone; icon: IconName; title: string;
  /** One line naming what it is about (never the car's full details). */
  about: string; plate?: string | null;
  /** What is wrong: one sentence and the facts behind it. */
  what: string; facts: [string, string][];
  stockId?: string; planId?: string; leadId?: string;
  /** Values the fix forms start from. */
  bond?: { status: string | null; deadline: string | null; extension: string | null; arrived: string | null };
  priceUgx?: number; owingUgx?: number; phone?: string | null; buyer?: string | null;
  findings?: { question: string; ask: string; line: string }[];
}

interface PayItem {
  planId: string; state: 'paid' | 'late' | 'owing'; lateUgx: number; daysLate: number; car: { stockId: string; name: string; plate: string | null };
  buyer: { name: string | null; phone?: string | null }; next: { seq: number; dueOn: string; owingUgx: number; daysUntil: number } | null;
}
interface Lead { leadId: string; stage: string; source: string; customer: { name: string | null; phone: string | null }; car: string | null; createdAt: string }

const SOURCES: Record<string, string> = { whatsapp: 'WhatsApp', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', broker: 'A broker', walk_in: 'Walked in', phone_call: 'Phone call', other: 'Other' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Payments due within this many days count as "due soon", as on the dashboard. */
const DUE_SOON_DAYS = 7;
const customsLabel = (s: string | null) => CUSTOMS.find(([k]) => k === s)?.[1] ?? 'Not given';

/** The alerts for one dealer, as the signed-in person may see them. Shared by the page and the side bar count. */
export const dealerAlerts = cache(async (org: string, approved: boolean): Promise<DealerAlert[]> => {
  const as = { auth: true, headers: { 'X-Organisation-Id': org } };
  const [stock, pay, leads] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items).catch(() => [] as StockItem[]),
    approved ? api<{ items: PayItem[] }>('/dealer/payments?show=all', as).then((r) => r.items).catch(() => undefined) : Promise.resolve(undefined),
    approved ? api<{ items: Lead[] }>('/dealer/leads?stage=open', as).then((r) => r.items).catch(() => [] as Lead[]) : Promise.resolve([] as Lead[]),
  ]);
  const out: DealerAlert[] = [];
  const onCar = (c: StockItem) => ({ stockId: c.stockId, about: carName(c), plate: c.vehicle?.currentPlate ?? c.held?.plate ?? null });

  for (const c of stock) {
    const serious = c.questions.filter((q) => q.status === 'serious');
    if (!serious.length) continue;
    out.push({ id: `finding:${c.stockId}`, kind: 'finding', tone: 'red', icon: 'report', title: 'Serious finding in the records', ...onCar(c),
      what: serious.length === 1 ? 'One of the seven questions about this car has a serious finding.' : `${serious.length} of the seven questions about this car have a serious finding.`,
      findings: serious.map((q) => ({ question: QUESTION_TITLES[q.question]?.short ?? q.question, ask: QUESTION_TITLES[q.question]?.ask ?? '', line: headline(q.headlineKey, q.params as never) })),
      facts: [['Who sees it', 'Buyers see the same on the car’s SAZO report']] });
  }
  for (const c of stock) {
    const b = c.clocks.bond;
    if (b.level !== 'overdue' && b.level !== 'soon') continue;
    const d = c.details;
    const left = b.daysLeft ?? 0;
    out.push({ id: `bond:${c.stockId}`, kind: 'bond', tone: b.level === 'overdue' ? 'red' : 'yellow', icon: b.level === 'overdue' ? 'inventory_2' : 'schedule', ...onCar(c),
      title: b.level === 'overdue' ? 'Bond deadline passed' : left === 0 ? 'Bond deadline today' : `Bond deadline in ${plural(left, 'day')}`,
      what: b.level === 'overdue' ? `The bond deadline you entered for this car passed ${plural(-left, 'day')} ago.` : left === 0 ? 'The bond deadline you entered for this car is today.' : `The bond deadline you entered for this car is in ${plural(left, 'day')}.`,
      facts: [
        ['Bond deadline', `${formatDate(b.deadline)}, ${b.level === 'overdue' ? `${plural(-left, 'day')} ago` : left === 0 ? 'today' : `${plural(left, 'day')} left`}`],
        ...(d.bondArrivedOn ? [['Arrived at the bond', `${formatDate(d.bondArrivedOn)}${b.daysInBond !== null ? `, ${plural(b.daysInBond, 'day')} ago` : ''}`] as [string, string]] : []),
        ...(d.yard ? [['Bond', d.yard] as [string, string]] : []),
        ['Customs status', customsLabel(d.customsStatus)],
        ['Approved extension', d.customsExtensionUntil ? formatDate(d.customsExtensionUntil) : 'None entered'],
      ],
      bond: { status: d.customsStatus, deadline: d.customsDeadline, extension: d.customsExtensionUntil, arrived: d.bondArrivedOn } });
  }
  for (const p of pay ?? []) {
    if (p.state !== 'late') continue;
    out.push({ id: `late:${p.planId}`, kind: 'late', tone: 'red', icon: 'savings', planId: p.planId, about: p.car.name, plate: p.car.plate,
      title: `Payment ${plural(p.daysLate, 'day')} late, ${formatUgx(p.lateUgx)}`, what: `${p.buyer.name ?? 'The buyer'} is ${plural(p.daysLate, 'day')} late with a payment.`,
      facts: [['Buyer', [p.buyer.name, p.buyer.phone ? localPhone(p.buyer.phone) : null].filter(Boolean).join(' · ') || 'Not given'], ['Late now', formatUgx(p.lateUgx, false)]],
      owingUgx: p.lateUgx, phone: p.buyer.phone ?? null, buyer: p.buyer.name });
  }
  // Stock age: yellow once a level the dealer set is passed, red past the last one (as the chip on each car).
  for (const c of stock) {
    const { stockAgeLevel: level, stockAgeAlertDays: levels, daysInStock } = c.clocks;
    if (level === 0) continue;
    const sorted = [...levels].sort((a, b) => a - b);
    const last = level >= sorted.length;
    out.push({ id: `age:${c.stockId}`, kind: 'age', tone: last ? 'red' : 'yellow', icon: 'schedule', ...onCar(c), title: `In stock for ${plural(daysInStock, 'day')}`,
      what: last ? 'This car has been in stock longer than the last level you set.' : 'This car has been in stock longer than a level you set.',
      facts: [['In stock', plural(daysInStock, 'day')], ['Your levels', `${sorted.join(', ')} days (${sorted.slice(0, level).join(', ')} passed)`], ['Asking price', formatUgx(c.askingPriceUgx, false)]],
      priceUgx: c.askingPriceUgx });
  }
  for (const p of pay ?? []) {
    if (p.state !== 'owing' || !p.next || p.next.daysUntil > DUE_SOON_DAYS) continue;
    const n = p.next;
    out.push({ id: `due:${p.planId}`, kind: 'due', tone: 'yellow', icon: 'savings', planId: p.planId, about: p.car.name, plate: p.car.plate,
      title: n.daysUntil <= 0 ? `Payment due today, ${formatUgx(n.owingUgx)}` : `Payment due in ${plural(n.daysUntil, 'day')}, ${formatUgx(n.owingUgx)}`,
      what: `Payment ${n.seq === 0 ? 'of the deposit' : n.seq} from ${p.buyer.name ?? 'the buyer'} is due ${formatDate(n.dueOn)}.`,
      facts: [['Buyer', [p.buyer.name, p.buyer.phone ? localPhone(p.buyer.phone) : null].filter(Boolean).join(' · ') || 'Not given'], ['Due', formatDate(n.dueOn)], ['Amount', formatUgx(n.owingUgx, false)]],
      owingUgx: n.owingUgx, phone: p.buyer.phone ?? null, buyer: p.buyer.name });
  }
  for (const l of leads) {
    if (l.stage !== 'enquiry') continue;
    const who = l.customer.name ?? 'A buyer';
    out.push({ id: `enquiry:${l.leadId}`, kind: 'enquiry', tone: 'yellow', icon: 'forum', leadId: l.leadId, title: 'Enquiry not answered yet',
      about: [who, l.car].filter(Boolean).join(' · '), what: 'A new enquiry has not been answered yet.',
      facts: [['Who', [l.customer.name, l.customer.phone ? localPhone(l.customer.phone) : null].filter(Boolean).join(' · ') || 'Not given'], ...(l.car ? [['Car', l.car] as [string, string]] : []),
        ['Came from', SOURCES[l.source] ?? l.source], ['Asked on', formatDate(l.createdAt)], ['Stage', 'New enquiry']],
      phone: l.customer.phone, buyer: l.customer.name });
  }
  // Worst first: red before yellow, otherwise in the order above.
  return [...out.filter((a) => a.tone === 'red'), ...out.filter((a) => a.tone === 'yellow')];
});

/** The side bar count and its colour: red when anything needs acting on now, otherwise yellow. */
export async function alertsBadge(org: string, approved: boolean): Promise<{ count: number; tone?: AlertTone }> {
  const all = await dealerAlerts(org, approved);
  return { count: all.length, tone: all.some((a) => a.tone === 'red') ? 'red' : all.length ? 'yellow' : undefined };
}
