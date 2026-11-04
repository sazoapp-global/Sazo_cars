// The dealer's alerts (4 Nov 2026): everything in the business that needs someone, worst first, in one list that the
// Alerts item in the side bar opens. Colours as agreed for alerts (D-111): red = act now, yellow = check soon, and
// green "All clear" when there is nothing. Built from what the console already shows elsewhere; nothing is stored,
// so an alert goes away by itself once it is dealt with. Money alerts are for managers only (D-146).
import { formatDate, formatUgx } from '@sazo/contracts';
import { cache } from 'react';
import type { IconName } from '@/components/icon';
import { api } from '@/lib/api';
import type { StockItem } from '@/lib/types';
import { carName } from './labels';

export type AlertTone = 'red' | 'yellow';
export interface DealerAlert { tone: AlertTone; icon: IconName; title: string; detail: string; action: { label: string; href: string } }

interface DashboardAlerts {
  enquiries: { waiting: number };
  payments?: { lateUgx: number; lateBuyers: number;
    dueSoon: { planId: string; car: { name: string; plate: string | null }; state: string; daysLate: number; next: { dueOn: string; owingUgx: number } | null }[] };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The alerts for one dealer, as the signed-in person may see them. Shared by the page and the side bar count. */
export const dealerAlerts = cache(async (org: string, approved: boolean): Promise<DealerAlert[]> => {
  const as = { auth: true, headers: { 'X-Organisation-Id': org } };
  const [stock, dash] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items).catch(() => [] as StockItem[]),
    approved ? api<DashboardAlerts>('/dealer/dashboard', as).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const car = (c: StockItem) => `/dealer/${org}/car/${c.stockId}`;
  const named = (c: StockItem) => [carName(c), c.vehicle?.currentPlate ?? c.held?.plate].filter(Boolean).join(', ');
  const out: DealerAlert[] = [];

  for (const c of stock) {
    if (c.questions.some((q) => q.status === 'serious')) {
      out.push({ tone: 'red', icon: 'report', title: 'Serious finding in the records', detail: `${named(c)}. Buyers see the same finding. Check it before you sell.`, action: { label: 'Open the car', href: car(c) } });
    }
  }
  for (const c of stock) {
    const b = c.clocks.bond;
    const where = c.details.yard ? `, at ${c.details.yard}` : '';
    if (b.level === 'overdue') {
      out.push({ tone: 'red', icon: 'inventory_2', title: 'Bond deadline passed', detail: `${named(c)}${where}. The deadline you entered was ${formatDate(b.deadline)}.`, action: { label: 'Open the car', href: car(c) } });
    } else if (b.level === 'soon') {
      out.push({ tone: 'yellow', icon: 'schedule', title: b.daysLeft === 0 ? 'Bond deadline today' : `Bond deadline in ${plural(b.daysLeft ?? 0, 'day')}`,
        detail: `${named(c)}${where}. The deadline you entered is ${formatDate(b.deadline)}.`, action: { label: 'Open the car', href: car(c) } });
    }
  }
  const pay = dash?.payments;
  if (pay && pay.lateBuyers > 0) {
    const late = pay.dueSoon.filter((p) => p.state === 'late');
    out.push({ tone: 'red', icon: 'savings', title: `${plural(pay.lateBuyers, 'payment')} ${pay.lateBuyers === 1 ? 'is' : 'are'} late, ${formatUgx(pay.lateUgx)}`,
      detail: late.length ? `${late.map((p) => `${p.car.name}${p.car.plate ? ` ${p.car.plate}` : ''} ${plural(p.daysLate, 'day')}`).join(', ')}.` : 'See who still owes you.',
      action: { label: 'Open Payments', href: `/dealer/${org}/payments` } });
  }
  // Stock age: yellow once a level the dealer set is passed, red past the last one (as the chip on each car).
  for (const c of stock) {
    const { stockAgeLevel: level, stockAgeAlertDays: levels, daysInStock } = c.clocks;
    if (level === 0) continue;
    const passed = [...levels].sort((a, b) => a - b)[level - 1];
    out.push({ tone: level >= levels.length ? 'red' : 'yellow', icon: 'schedule', title: `In stock for ${plural(daysInStock, 'day')}`,
      detail: `${named(c)}. Past the ${passed} day level you set in Settings.`, action: { label: 'Open the car', href: car(c) } });
  }
  for (const p of pay?.dueSoon ?? []) {
    if (p.state === 'late' || !p.next) continue;
    out.push({ tone: 'yellow', icon: 'savings', title: 'A payment is due soon', detail: `${p.car.name}${p.car.plate ? ` ${p.car.plate}` : ''}, ${formatUgx(p.next.owingUgx)} due ${formatDate(p.next.dueOn)}.`,
      action: { label: 'Open Payments', href: `/dealer/${org}/payments` } });
  }
  if (dash && dash.enquiries.waiting > 0) {
    const n = dash.enquiries.waiting;
    out.push({ tone: 'yellow', icon: 'forum', title: `${plural(n, 'enquiry', 'enquiries')} not answered yet`, detail: n === 1 ? 'A buyer is waiting for your reply.' : 'Buyers are waiting for your reply.',
      action: { label: 'Open Enquiries', href: `/dealer/${org}/enquiries` } });
  }
  // Worst first: red before yellow, otherwise in the order above.
  return [...out.filter((a) => a.tone === 'red'), ...out.filter((a) => a.tone === 'yellow')];
});

/** The side bar count and its colour: red when anything needs acting on now, otherwise yellow. */
export async function alertsBadge(org: string, approved: boolean): Promise<{ count: number; tone?: AlertTone }> {
  const all = await dealerAlerts(org, approved);
  return { count: all.length, tone: all.some((a) => a.tone === 'red') ? 'red' : all.length ? 'yellow' : undefined };
}
