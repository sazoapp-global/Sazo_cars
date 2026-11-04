// Alerts (approved 4 Nov 2026): what needs the dealer, worst first, opened from the side bar beside it. Red = act
// now, yellow = check soon, green "All clear" when there is nothing (D-111). Each alert opens the car or page it is
// about, inside the console.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation } from '@/lib/types';
import { dealerAlerts, type AlertTone, type DealerAlert } from '../../alerts';

export const metadata: Metadata = { title: 'Alerts', robots: { index: false } };

const TONE: Record<AlertTone | 'green', { card: string; bar: string; text: string; circle: string; dot: string }> = {
  red: { card: 'border-bad-line', bar: 'border-l-bad-text', text: 'text-bad-text', circle: 'bg-bad-fill text-bad-text', dot: 'bg-bad-text' },
  yellow: { card: 'border-warn-line', bar: 'border-l-warn-text', text: 'text-warn-text', circle: 'bg-warn-fill text-warn-text', dot: 'bg-warn-text' },
  green: { card: 'border-ok-line', bar: 'border-l-ok-text', text: 'text-ok-text', circle: 'bg-ok-fill text-ok-text', dot: 'bg-ok-text' },
};
const Dot = ({ tone }: { tone: AlertTone | 'green' }) => <span aria-hidden className={`inline-block size-3 shrink-0 rounded-full ${TONE[tone].dot}`} />;

export default async function DealerAlerts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/alerts`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status === 'rejected' || org.status === 'suspended') redirect(`/dealer/${id}`);
  const approved = org.status === 'approved';
  const name = org.tradingName ?? org.legalName;
  const [alerts, me] = await Promise.all([dealerAlerts(id, approved), api<Me>('/me', { auth: true }).catch(() => undefined)]);
  const red = alerts.filter((a) => a.tone === 'red');
  const yellow = alerts.filter((a) => a.tone === 'yellow');

  const group = (tone: AlertTone, label: string, list: DealerAlert[]) => list.length > 0 && (
    <section aria-labelledby={`${tone}-h`} className="space-y-3">
      <h2 id={`${tone}-h`} className="flex items-center gap-2 font-display text-lg font-bold"><Dot tone={tone} />{label}<span className="text-sm font-semibold text-muted">{list.length}</span></h2>
      <ul className="space-y-3">
        {list.map((a, i) => (
          <li key={`${a.title}-${i}`} className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-l-[6px] bg-card p-4 shadow-sm ${TONE[tone].card} ${TONE[tone].bar}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${TONE[tone].circle}`}><Icon name={a.icon} size={22} /></span>
            <div className="min-w-0 flex-1 basis-56">
              <p className={`font-bold ${TONE[tone].text}`}>{a.title}</p>
              <p className="text-sm text-on-surface">{a.detail}</p>
            </div>
            <Link href={a.action.href} className="btn btn-ghost !min-h-10 w-full shrink-0 !px-3 text-sm sm:w-auto">{a.action.label}<Icon name="chevron_right" size={18} /></Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name, approved }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: alerts</h1>
          <p className="mt-1 max-w-3xl text-muted">Things in your business that need you, worst first. Each alert goes away by itself once it is dealt with.</p>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <span className="inline-flex items-center gap-1"><Dot tone="red" />Act now</span>
          <span className="inline-flex items-center gap-1"><Dot tone="yellow" />Check soon</span>
          <span className="inline-flex items-center gap-1"><Dot tone="green" />All clear</span>
        </p>
      </div>

      {alerts.length === 0 ? (
        <div role="status" className="flex items-center gap-4 rounded-[14px] border-2 border-ok-line bg-ok-fill p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ok-text"><Icon name="check_circle" size={28} /></span>
          <div>
            <p className="font-display text-xl font-bold text-ok-text">All clear</p>
            <p className="text-on-surface">No serious findings, no bond deadlines close and nothing late. SAZO checks again whenever something changes.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {([['red', red.length, 'Act now'], ['yellow', yellow.length, 'Check soon']] as const).map(([tone, n, label]) => (
              <a key={tone} href={`#${tone}-h`} className={`flex items-center gap-3 rounded-[14px] border-2 p-4 ${tone === 'red' ? 'border-bad-line bg-bad-fill' : 'border-warn-line bg-warn-fill'}`}>
                <span className={`font-display text-3xl font-extrabold tabular-nums ${TONE[tone].text}`}>{n}</span>
                <span className={`font-semibold ${TONE[tone].text}`}>{label}</span>
              </a>
            ))}
          </div>
          {group('red', 'Act now', red)}
          {group('yellow', 'Check soon', yellow)}
        </>
      )}
    </AppFrame>
  );
}
