// The messages screen (D-173), the same for the dealer's team and for brokers: conversations on the left,
// the open one on the right. On a phone the list and the conversation are separate screens.
import { CAR_CATEGORY_LABELS, KIND_LABELS, formatUgx, isCarCategory, isVehicleKind } from '@sazo/contracts';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { AutoRefresh } from './auto-refresh';
import { Composer } from './composer';
import { ScrollToEnd } from './scroll-to-end';
import type { CarCard, CarOption, ConversationItem, Thread } from './types';

const ZONE = 'Africa/Kampala';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
function dayLabel(iso: string, now = new Date()) {
  const d = day(iso);
  if (d === day(now.toISOString())) return 'Today';
  if (d === day(new Date(now.getTime() - 86_400_000).toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long' });
}
/** In the list: the time today, "Yesterday", or the date. */
function listWhen(iso: string) {
  const l = dayLabel(iso);
  return l === 'Today' ? clock(iso) : l === 'Yesterday' ? l : new Date(iso).toLocaleDateString('en-GB', { timeZone: ZONE, day: 'numeric', month: 'short' });
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function Avatar({ name, broker, small }: { name: string; broker?: boolean; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-extrabold ${small ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm'} ${broker ? 'bg-lime text-ink' : 'bg-primary-container text-white'}`}>
      {initials(name)}
    </span>
  );
}

function Car({ car, photo }: { car: CarCard; photo: (c: CarCard) => string | null }) {
  const src = photo(car);
  const kind = [car.category && isCarCategory(car.category) ? CAR_CATEGORY_LABELS[car.category] : null, car.kind && isVehicleKind(car.kind) ? KIND_LABELS[car.kind] : null].filter(Boolean).join(' · ');
  return (
    <span className="mt-2 flex w-[300px] max-w-full overflow-hidden rounded-xl border border-line bg-card text-ink">
      {src ? <img src={src} alt={`${car.name}, photo`} className="h-20 w-24 shrink-0 object-cover" /> : <span className="grid h-20 w-24 shrink-0 place-items-center bg-soft"><Icon name="directions_car" className="text-label" /></span>}
      <span className="min-w-0 p-2.5">
        <span className="block truncate text-sm font-bold">{car.name}</span>
        {kind && <span className="block truncate text-xs text-muted">{kind}</span>}
        <span className="block text-sm font-bold text-primary-container">{car.inStock ? formatUgx(car.askingPriceUgx, false) : 'No longer for sale'}</span>
      </span>
    </span>
  );
}

export interface MessagesViewProps {
  items: ConversationItem[];
  /** Dealers a broker may start a conversation with. */
  start?: { organisationId: string; name: string; district: string | null }[];
  /** The address of a conversation in the list (and of a dealer to start with). */
  href: (key: string) => string;
  selected?: string;
  thread?: Thread;
  /** Which side is reading: brokers' avatars are lime, the dealer's team navy. */
  side: 'dealer' | 'broker';
  photo: (c: CarCard) => string | null;
  composer?: { action: (form: FormData) => void | Promise<void>; hidden: Record<string, string>; cars: CarOption[]; carsLabel: string };
  backHref: string;
  error?: string;
}

export function MessagesView({ items, start = [], href, selected, thread, side, photo, composer, backHref, error }: MessagesViewProps) {
  const open = !!thread;
  const isBrokerTitle = (kind: 'team' | 'broker') => side === 'dealer' && kind === 'broker';
  let lastDay = '';
  const myLast = thread?.messages.filter((m) => m.mine).at(-1)?.id ?? 'none';
  return (
    <div className="flex overflow-hidden rounded-[14px] border border-line bg-card lg:h-[calc(100vh-15rem)] lg:min-h-[520px]">
      <AutoRefresh />
      <nav aria-label="Conversations" className={`${open ? 'max-lg:hidden' : 'w-full'} shrink-0 overflow-y-auto border-line lg:w-[340px] lg:border-r`}>
        {items.length === 0 && start.length === 0 && <p className="p-5 text-muted">No conversations yet.</p>}
        <ul>
          {items.map((c) => {
            const key = side === 'broker' ? c.organisationId : c.conversationId;
            const on = key === selected;
            return (
              <li key={c.conversationId}>
                <Link href={href(key)} aria-current={on ? 'page' : undefined}
                  className={`flex gap-3 border-b border-line px-4 py-3 hover:bg-soft ${on ? 'bg-soft shadow-[inset_4px_0_0_#002177]' : ''}`}>
                  <Avatar name={c.title} broker={isBrokerTitle(c.kind)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2"><span className="flex-1 truncate font-bold">{c.title}</span>{c.last && <span className="shrink-0 text-xs text-muted">{listWhen(c.last.at)}</span>}</span>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-label">{c.kind === 'team' ? 'Your team' : side === 'dealer' ? 'Broker' : 'Dealer'}</span>
                    <span className="flex items-center gap-2">
                      <span className={`flex-1 truncate text-sm ${c.unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                        {c.last ? `${c.last.sender === 'You' || c.kind === 'team' || side === 'dealer' ? `${c.last.sender}: ` : ''}${c.last.body}` : 'No messages yet'}
                      </span>
                      {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-container px-1.5 text-[11px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {start.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-label">Write to a dealer</p>
            <ul className="mt-2 space-y-1">
              {start.map((d) => (
                <li key={d.organisationId}>
                  <Link href={href(d.organisationId)} aria-current={d.organisationId === selected ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft ${d.organisationId === selected ? 'bg-soft' : ''}`}>
                    <Avatar name={d.name} small /><span className="min-w-0"><span className="block truncate font-semibold">{d.name}</span>{d.district && <span className="block text-xs text-muted">{d.district}</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {thread ? (
        <section aria-label={thread.title} className="flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <header className="flex items-center gap-3 border-b border-line px-4 py-3 lg:px-5">
            <Link href={backHref} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-soft lg:hidden" aria-label="Back to conversations"><Icon name="arrow_back" /></Link>
            <Avatar name={thread.title} broker={isBrokerTitle(thread.kind)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{thread.title}</span>
              <span className="block truncate text-sm text-muted">
                {isBrokerTitle(thread.kind)
                  ? `Broker${thread.seenBy.length ? ` · seen by ${thread.seenBy.map((s) => (s.you ? 'you' : s.name)).join(' and ')}` : ''}`
                  : thread.members.map((m) => `${m.name} (${m.role.toLowerCase()})`).join(' · ')}
              </span>
            </span>
          </header>
          <ol id="thread-messages" className="flex-1 space-y-4 overflow-y-auto bg-soft/60 px-4 py-5 lg:px-5" aria-label="Messages">
            {thread.messages.length === 0 && <li className="py-10 text-center text-muted">{side === 'broker' ? 'Say what you need, and add a car if it is about one. The whole team at this dealer will see it.' : 'No messages yet.'}</li>}
            {thread.messages.map((m) => {
              const d = dayLabel(m.createdAt);
              const sep = d !== lastDay ? (lastDay = d) : null;
              const broker = m.sender.role === 'Broker';
              return (
                <li key={m.id}>
                  {sep && <p className="mb-4 text-center text-xs font-semibold text-muted">{sep}</p>}
                  {m.mine ? (
                    <div className="flex justify-end"><div className="max-w-[85%] lg:max-w-[75%]">
                      <div className="whitespace-pre-line rounded-2xl rounded-br-md bg-primary-container px-4 py-2.5 text-white">{m.body}{m.car && <Car car={m.car} photo={photo} />}</div>
                      <p className="mt-1 text-right text-xs text-muted">{clock(m.createdAt)}{m.seen ? ' · Seen' : ''}</p>
                    </div></div>
                  ) : (
                    <div className="flex gap-2.5">
                      <span className="mt-5"><Avatar name={m.sender.name} broker={broker} small /></span>
                      <div className="max-w-[85%] lg:max-w-[75%]">
                        <p className="mb-1 text-xs font-semibold text-label">{m.sender.name}{m.sender.role ? ` · ${m.sender.role}` : ''}</p>
                        <div className="whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-card px-4 py-2.5">{m.body}{m.car && <Car car={m.car} photo={photo} />}</div>
                        <p className="mt-1 text-xs text-muted">{clock(m.createdAt)}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <ScrollToEnd list="thread-messages" count={thread.messages.length} />
          {error && <p role="alert" className="mx-3 mt-3 rounded-lg border border-bad-line bg-bad-fill p-2.5 text-sm font-semibold text-bad-text">{error}</p>}
          {composer && <Composer key={myLast} {...composer} />}
        </section>
      ) : (
        <div className="hidden flex-1 place-items-center p-10 text-center text-muted lg:grid">
          <div><Icon name="chat" size={40} className="mx-auto text-label" /><p className="mt-2">Choose a conversation.</p></div>
        </div>
      )}
    </div>
  );
}
