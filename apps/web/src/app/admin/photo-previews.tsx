'use client';
import { useState } from 'react';
import { Icon } from '@/components/icon';

/**
 * Photos a person sent (14 Nov 2026): small blurred previews in the card, so there is a photo to see at a glance
 * without its details on show; choosing one opens it large inside the card, with Close and Open full size.
 */
export function PhotoPreviews({ ids, title, noun }: { ids: string[]; title: string; noun: string }) {
  const [open, setOpen] = useState<number>();
  if (ids.length === 0) return null;
  const src = (id: string) => `/admin/files/${id}`;
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-2.5">
        {ids.map((id, i) => (
          <li key={id}>
            <button type="button" onClick={() => setOpen(open === i ? undefined : i)} aria-pressed={open === i}
              aria-label={`${open === i ? 'Hide' : 'View'} ${noun.toLowerCase()} ${i + 1}`}
              className={`relative block h-24 w-36 overflow-hidden rounded-[10px] bg-soft ${open === i ? 'border-[3px] border-primary-container' : 'border border-line'}`}>
              <img src={src(id)} alt="" className={`h-full w-full object-cover ${open === i ? '' : 'scale-110 blur-md'}`} />
              {open !== i && <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-ink">Photo {i + 1} · View</span>}
            </button>
          </li>
        ))}
      </ul>
      {open !== undefined && (
        <figure className="mt-3.5 rounded-xl border border-line bg-soft p-3">
          <figcaption className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">{noun} {open + 1} of {ids.length}</span>
            <span className="flex gap-3.5 text-sm font-semibold">
              <a href={src(ids[open]!)} target="_blank" rel="noopener noreferrer" className="link">Open full size</a>
              <button type="button" onClick={() => setOpen(undefined)} className="link">Close</button>
            </span>
          </figcaption>
          <img src={src(ids[open]!)} alt={`${noun} ${open + 1}`} className="block max-h-[520px] w-full rounded-lg bg-white object-contain" />
        </figure>
      )}
    </div>
  );
}
