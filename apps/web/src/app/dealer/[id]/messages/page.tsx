import { CAR_CATEGORY_LABELS, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { MessagesView } from '@/components/messages/messages-view';
import type { CarOption, ConversationItem, Thread } from '@/components/messages/types';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation, StockItem } from '@/lib/types';
import { carName } from '../../labels';
import { sendDealerMessage } from './actions';

export const metadata: Metadata = { title: 'Messages', robots: { index: false } };

type SP = Promise<{ c?: string; error?: string; info?: string }>;

/** Messages (D-173): the dealer's team among themselves, and with each broker who shares their cars. */
export default async function DealerMessages({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/messages`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status === 'rejected' || org.status === 'suspended') redirect(`/dealer/${id}`);
  const approved = org.status === 'approved';
  const manager = org.role === 'org_manager';
  const name = org.tradingName ?? org.legalName;
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  // The open conversation first: opening it marks it read, so the list and the side bar count are up to date.
  const thread = sp.c
    ? await api<Thread>(`/dealer/messages/${encodeURIComponent(sp.c)}`, as).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; })
    : undefined;
  const [list, me, stock] = await Promise.all([
    api<{ items: ConversationItem[] }>('/dealer/messages', as).then((r) => r.items),
    api<Me>('/me', { auth: true }).catch(() => undefined),
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items).catch(() => [] as StockItem[]),
  ]);
  // In the team's conversation any car for sale; with a broker only the cars opened to brokers.
  const cars: CarOption[] = stock
    .filter((c) => thread?.kind !== 'broker' || (c.details.openToBrokers && c.details.commissionKind && c.linked))
    .map((c) => ({
      stockId: c.stockId, name: carName(c),
      detail: [c.details.category ? CAR_CATEGORY_LABELS[c.details.category as keyof typeof CAR_CATEGORY_LABELS] : null, formatUgx(c.askingPriceUgx, false)].filter(Boolean).join(' · '),
      photoUrl: c.photos[0] ? `/dealer/${id}/car/${c.stockId}/photo/${c.photos[0].photoId}` : null,
    }));
  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name, approved }}
      person={me ? { name: me.displayName, role: manager ? 'Manager' : 'Sales' } : undefined}>
      <MessagesView side="dealer" items={list} selected={sp.c === 'team' ? list.find((c) => c.kind === 'team')?.conversationId : sp.c}
        href={(k) => `/dealer/${id}/messages?c=${k}`} backHref={`/dealer/${id}/messages`} thread={thread} error={sp.error}
        info={sp.c ? { open: sp.info === '1', openHref: `/dealer/${id}/messages?c=${sp.c}&info=1`, closeHref: `/dealer/${id}/messages?c=${sp.c}` } : undefined}
        photo={(c) => (c.photoId ? `/dealer/${id}/car/${c.stockId}/photo/${c.photoId}` : null)}
        composer={thread ? { action: sendDealerMessage, hidden: { org: id, conversation: thread.conversationId! }, cars, carsLabel: thread.kind === 'broker' ? 'Your cars open to brokers' : 'Your cars for sale' } : undefined} />
    </AppFrame>
  );
}
