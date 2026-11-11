'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icon';

export interface ChatRow { key: string; href: string; title: string; label: string; group: 'team' | 'broker' | 'dealer'; last: string; when: string; unread: number; lime: boolean }
export interface StartRow { key: string; href: string; title: string; detail: string | null }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/**
 * The chats (D-174, 11 Nov 2026): the whole space beside the side bar, with a search across the names and
 * messages, and chips to show only unread chats, the team's or the brokers'. A broker also finds the dealers
 * they may start a chat with.
 */
export function ChatList({ rows, start = [], chips }: { rows: ChatRow[]; start?: StartRow[]; chips: ('team' | 'broker')[] }) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'all' | 'unread' | 'team' | 'broker'>('all');
  const words = q.trim().toLowerCase();
  const match = (s: string) => !words || s.toLowerCase().includes(words);
  const shown = rows.filter((r) => (match(r.title) || match(r.last)) && (chip === 'all' || (chip === 'unread' ? r.unread > 0 : r.group === chip)));
  const startShown = start.filter((s) => match(s.title) || match(s.detail ?? ''));
  const chipClass = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? 'bg-primary-container text-white' : 'bg-soft text-ink hover:bg-line'}`;
  const options: [typeof chip, string][] = [['all', 'All'], ['unread', 'Unread'], ...chips.map((c): [typeof chip, string] => [c, c === 'team' ? 'Team' : 'Brokers'])];
  return (
    <div className="min-h-[calc(100dvh-12rem)] bg-card lg:min-h-[calc(100dvh-3rem)]">
      <div className="px-4 pt-5 md:px-8">
        <h1 className="font-display text-2xl font-extrabold">Messages</h1>
        <label className="mt-3 flex h-12 w-full items-center gap-2 rounded-full bg-soft px-4 text-muted focus-within:ring-2 focus-within:ring-primary-container">
          <Icon name="search" size={20} />
          <span className="sr-only">Search chats</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={start.length ? 'Search or start a new chat' : 'Search chats'}
            className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
        </label>
        <div role="group" aria-label="Show" className="mt-3 flex flex-wrap gap-2">
          {options.map(([k, l]) => <button key={k} type="button" aria-pressed={chip === k} onClick={() => setChip(k)} className={chipClass(chip === k)}>{l}</button>)}
        </div>
      </div>
      <nav aria-label="Conversations" className="mt-2">
        <ul>
          {shown.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="flex items-center gap-4 px-4 hover:bg-soft md:px-8">
                <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${r.lime ? 'bg-lime text-ink' : 'bg-primary-container text-white'}`}>{initials(r.title)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-3 border-b border-line py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{r.title}</span>
                    <span className={`block truncate text-sm ${r.unread ? 'font-semibold text-ink' : 'text-muted'}`}>{r.last}</span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-label">{r.label}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-xs ${r.unread ? 'font-bold text-primary-container' : 'text-muted'}`}>{r.when}</span>
                    {r.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[11px] font-extrabold text-ink" aria-label={`${r.unread} unread`}>{r.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 && startShown.length === 0 && (
          <p className="px-4 py-10 text-center text-muted md:px-8">{rows.length === 0 && start.length === 0 ? 'No chats yet.' : 'No chats match.'}</p>
        )}
        {startShown.length > 0 && chip === 'all' && (
          <div className="px-4 pb-6 pt-4 md:px-8">
            <p className="text-[11px] font-bold uppercase tracking-wider text-label">Start a chat</p>
            <ul className="mt-1">
              {startShown.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-soft">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-extrabold text-white">{initials(s.title)}</span>
                    <span className="min-w-0"><span className="block truncate font-semibold">{s.title}</span>{s.detail && <span className="block text-xs text-muted">{s.detail}</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  );
}
