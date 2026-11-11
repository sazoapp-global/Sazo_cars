// The messages screens (D-173, laid out like WhatsApp in D-174), the same for the dealer's team and for
// brokers. Messages opens the chat list across the whole space beside the side bar; choosing a chat opens it
// in that same space, with a back arrow to the list and (i) for the chat's details.
import { CAR_CATEGORY_LABELS, KIND_LABELS, formatUgx, isCarCategory, isVehicleKind } from '@sazo/contracts';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { AutoRefresh } from './auto-refresh';
import { ChatList, type ChatRow } from './chat-list';
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

/** Each writer's name keeps one colour in a chat, as on WhatsApp; brokers are always green. */
const NAME_COLOURS = ['#0033aa', '#7c3aed', '#b45309', '#0f766e', '#be185d', '#1d4ed8'];
function nameColour(name: string, role: string) {
  if (role === 'Broker') return '#4d7c0f';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[h % NAME_COLOURS.length]!;
}
/** The chat's soft dotted background. */
const WALLPAPER = { backgroundColor: 'var(--color-soft)', backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-primary-container) 9%, transparent) 1.2px, transparent 1.2px)', backgroundSize: '18px 18px' };

function Avatar({ name, broker, size = 44 }: { name: string; broker?: boolean; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size > 40 ? 15 : 12 }}
      className={`grid shrink-0 place-items-center rounded-full font-extrabold ${broker ? 'bg-lime text-ink' : 'bg-primary-container text-white'}`}>
      {initials(name)}
    </span>
  );
}

const carKind = (car: CarCard) => [car.category && isCarCategory(car.category) ? CAR_CATEGORY_LABELS[car.category] : null, car.kind && isVehicleKind(car.kind) ? KIND_LABELS[car.kind] : null].filter(Boolean).join(' · ');

function Car({ car, photo }: { car: CarCard; photo: (c: CarCard) => string | null }) {
  const src = photo(car);
  const kind = carKind(car);
  return (
    <span className="mb-1 mt-1.5 flex w-[290px] max-w-full overflow-hidden rounded-lg bg-white text-ink ring-1 ring-black/5">
      {src ? <img src={src} alt={`${car.name}, photo`} className="h-[74px] w-24 shrink-0 object-cover" /> : <span className="grid h-[74px] w-24 shrink-0 place-items-center bg-soft"><Icon name="directions_car" className="text-label" /></span>}
      <span className="min-w-0 px-2.5 py-2">
        <span className="block truncate text-sm font-bold">{car.name}</span>
        {kind && <span className="block truncate text-xs text-muted">{kind}</span>}
        <span className="block text-sm font-bold text-primary-container">{car.inStock ? formatUgx(car.askingPriceUgx, false) : 'No longer for sale'}</span>
      </span>
    </span>
  );
}

export interface MessagesViewProps {
  items: ConversationItem[];
  /** Dealers a broker may start a chat with. */
  start?: { organisationId: string; name: string; district: string | null }[];
  /** The address of a chat (and of a dealer to start one with). */
  href: (key: string) => string;
  selected?: string;
  thread?: Thread;
  /** Which side is reading: brokers' avatars are lime, the dealer's team navy. */
  side: 'dealer' | 'broker';
  photo: (c: CarCard) => string | null;
  composer?: { action: (form: FormData) => void | Promise<void>; hidden: Record<string, string>; cars: CarOption[]; carsLabel: string };
  backHref: string;
  /** The chat's details panel: open, and the addresses that open and close it. */
  info?: { open: boolean; openHref: string; closeHref: string };
  error?: string;
}

export function MessagesView(p: MessagesViewProps) {
  // Edge to edge in the frame: the chat screens fill the whole space beside the side bar.
  return (
    <div className="-mx-4 -my-6 md:-mx-8 md:-my-8" {...(p.thread ? { 'data-chat-open': '' } : {})}>
      <AutoRefresh />
      {p.thread ? <Chat {...p} thread={p.thread} /> : <List {...p} />}
    </div>
  );
}

function List({ items, start = [], href, side }: MessagesViewProps) {
  const rows: ChatRow[] = items.map((c) => ({
    key: c.conversationId, href: href(side === 'broker' ? c.organisationId : c.conversationId), title: c.title,
    label: c.kind === 'team' ? 'Your team' : side === 'dealer' ? 'Broker' : 'Dealer',
    group: c.kind === 'team' ? 'team' : side === 'dealer' ? 'broker' : 'dealer',
    last: c.last ? `${c.last.sender === 'You' || c.kind === 'team' ? `${c.last.sender}: ` : ''}${c.last.body}` : 'No messages yet',
    when: c.last ? listWhen(c.last.at) : '', unread: c.unread, lime: side === 'dealer' && c.kind === 'broker',
  }));
  return <ChatList rows={rows} chips={side === 'dealer' ? ['team', 'broker'] : []}
    start={start.map((d) => ({ key: d.organisationId, href: href(d.organisationId), title: d.name, detail: d.district }))} />;
}

function Chat({ thread, side, photo, composer, backHref, info, error }: MessagesViewProps & { thread: Thread }) {
  const brokerChat = side === 'dealer' && thread.kind === 'broker';
  const subtitle = brokerChat
    ? `Broker · ${['you', ...thread.members.filter((m) => !m.you).map((m) => m.name)].join(', ').replace(/, ([^,]*)$/, ' and $1')} see this chat`
    : thread.members.map((m) => `${m.name} (${m.role.toLowerCase()})`).join(', ');
  const myLast = thread.messages.filter((m) => m.mine).at(-1)?.id ?? 'none';
  const cars = [...new Map(thread.messages.filter((m) => m.car).map((m) => [m.car!.stockId, m.car!])).values()];
  let lastDay = '';
  return (
    <div className="flex max-lg:min-h-[calc(100dvh-6rem)] lg:h-[calc(100dvh-3rem)]">
      <section aria-label={thread.title} className={`flex min-w-0 flex-1 flex-col ${info?.open ? 'max-lg:hidden' : ''}`}>
        <header className="sticky top-16 z-20 flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 lg:static md:px-4">
          <Link href={backHref} aria-label="Back to your chats" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-soft"><Icon name="arrow_back" /></Link>
          <Avatar name={thread.title} broker={brokerChat} size={42} />
          <span className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{thread.title}</h1>
            <span className="block truncate text-[13px] text-muted">{subtitle}</span>
          </span>
          {info && <Link href={info.open ? info.closeHref : info.openHref} aria-label="Chat details" aria-expanded={info.open} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-soft"><Icon name="info" /></Link>}
        </header>
        <ol id="thread-messages" aria-label="Messages" className="flex-1 space-y-2 px-3 py-4 md:px-10 lg:overflow-y-auto lg:px-14" style={WALLPAPER}>
          {thread.messages.length === 0 && (
            <li className="mx-auto mt-10 max-w-sm rounded-lg bg-card p-4 text-center text-sm text-muted shadow-sm">
              {side === 'broker' ? 'Say what you need, and add a car if it is about one. The whole team at this dealer will see it.' : 'No messages yet.'}
            </li>
          )}
          {thread.messages.map((m) => {
            const d = dayLabel(m.createdAt);
            const sep = d !== lastDay ? (lastDay = d) : null;
            const time = (
              <span className="float-right ml-3 mt-2 flex items-center gap-1 text-[11px] text-muted">
                {clock(m.createdAt)}
                {m.mine && <span className={m.seen ? 'text-primary-container' : ''} role="img" aria-label={m.seen ? 'Seen' : 'Sent'}><Icon name={m.seen ? 'done_all' : 'check'} size={16} /></span>}
              </span>
            );
            return (
              <li key={m.id}>
                {sep && <p className="mx-auto mb-3 mt-1 w-fit rounded-lg bg-card px-3 py-1 text-xs font-semibold text-muted shadow-sm">{sep}</p>}
                {m.mine ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-line rounded-lg rounded-tr-none px-3 pb-1.5 pt-2 text-ink shadow-sm lg:max-w-[70%]" style={{ background: '#e6f7b0' }}>
                      {m.body}{m.car && <Car car={m.car} photo={photo} />}{time}<span className="clear-both block" />
                    </div>
                  </div>
                ) : (
                  <div className="flex">
                    <div className="max-w-[85%] whitespace-pre-line rounded-lg rounded-tl-none bg-card px-3 pb-1.5 pt-2 shadow-sm lg:max-w-[70%]">
                      <p className="text-[13px] font-bold" style={{ color: nameColour(m.sender.name, m.sender.role) }}>{m.sender.name}{m.sender.role ? ` · ${m.sender.role}` : ''}</p>
                      {m.body}{m.car && <Car car={m.car} photo={photo} />}{time}<span className="clear-both block" />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <ScrollToEnd list="thread-messages" count={thread.messages.length} />
        <div className="sticky bottom-0 z-20 lg:static">
          {error && <p role="alert" className="border-t border-bad-line bg-bad-fill px-4 py-2.5 text-sm font-semibold text-bad-text">{error}</p>}
          {composer && <Composer key={myLast} {...composer} />}
        </div>
      </section>

      {info?.open && (
        <aside aria-label="Chat details" className="flex w-full shrink-0 flex-col border-line bg-card lg:w-[360px] lg:border-l">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Link href={info.closeHref} aria-label="Close chat details" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-soft"><Icon name="arrow_back" /></Link>
            <p className="font-bold">Chat details</p>
          </div>
          <div className="overflow-y-auto">
            <div className="flex flex-col items-center border-b border-line px-5 py-6 text-center">
              <Avatar name={thread.title} broker={brokerChat} size={84} />
              <p className="mt-3 text-xl font-extrabold">{thread.title}</p>
              <p className="text-sm text-muted">{thread.kind === 'team' ? 'Your team' : brokerChat ? 'Approved broker' : 'Dealer'}</p>
            </div>
            <div className="border-b border-line px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-label">In this chat</p>
              <ul className="mt-2 space-y-3">
                {thread.people.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <Avatar name={m.name} broker={m.role === 'Broker'} size={38} />
                    <span><span className="block font-semibold">{m.name}{m.you ? ' (you)' : ''}</span><span className="block text-xs text-muted">{m.role}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-label">Cars in this chat</p>
              {cars.length === 0 ? <p className="mt-1 text-sm text-muted">No cars yet. Use the car button to add one to a message.</p> : (
                <ul className="mt-2 space-y-3">
                  {cars.map((c) => {
                    const src = photo(c);
                    return (
                      <li key={c.stockId} className="flex items-center gap-3">
                        {src ? <img src={src} alt="" className="h-14 w-20 rounded-lg object-cover" /> : <span className="grid h-14 w-20 place-items-center rounded-lg bg-soft"><Icon name="directions_car" className="text-label" /></span>}
                        <span className="min-w-0"><span className="block truncate text-sm font-bold">{c.name}</span>
                          <span className="block text-xs text-muted">{[c.category && isCarCategory(c.category) ? CAR_CATEGORY_LABELS[c.category] : null, c.inStock ? formatUgx(c.askingPriceUgx, false) : 'No longer for sale'].filter(Boolean).join(' · ')}</span></span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
