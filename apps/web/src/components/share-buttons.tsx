'use client';
import { useState } from 'react';
import { Icon } from './icon';

/** Copy the link, or use the phone's share sheet (WhatsApp, SMS…) where available. */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" onClick={async () => {
        if (navigator.share) { await navigator.share({ title, url }).catch(() => undefined); return; }
        await navigator.clipboard.writeText(url); setCopied(true);
      }}><Icon name="share" />Share</button>
      <button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? 'Copied' : 'Copy link'}</button>
      <span aria-live="polite" className="sr-only">{copied ? 'Link copied' : ''}</span>
    </div>
  );
}

/** Opens the print window, where "Save as PDF" downloads the report as a PDF file. */
export function PrintButton({ primary = false }: { primary?: boolean }) {
  return <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-ghost'} print:hidden`} onClick={() => window.print()}><Icon name="download" />Save as PDF</button>;
}
