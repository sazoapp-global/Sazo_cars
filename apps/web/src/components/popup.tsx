'use client';
// A popup over the page (native <dialog>): opened by a button, closed by Close, Escape or a click outside.
// Used to show an account's details without leaving the page.
import { useId, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/icon';

export function Popup({ button, buttonClassName, buttonLabel, title, onOpen, children }: {
  button: ReactNode; buttonClassName?: string; buttonLabel?: string; title: string; onOpen?: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = () => { ref.current?.showModal(); onOpen?.(); };
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={buttonClassName} aria-label={buttonLabel} aria-haspopup="dialog" onClick={open}>{button}</button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-[14px] border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/60">
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id={titleId} className="font-display text-lg font-bold">{title}</h2>
            <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Close"><Icon name="close" size={20} /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}

/** Label and value rows inside a popup. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-semibold">{v}</dd></div>))}
    </dl>
  );
}
