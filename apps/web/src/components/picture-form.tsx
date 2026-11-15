'use client';
// Choose a logo or photo (D-186): picking a picture sends it at once; SAZO makes it square. Remove asks first.
import { useRef, useState } from 'react';
import { ConfirmButton } from '@/components/confirm-button';
import { Icon } from '@/components/icon';
import { PICTURE_ACCEPT } from '@/lib/upload-types';

export function PictureForm({ field, has, chooseLabel, changeLabel, removeTitle, removeText, action, remove, hidden }: {
  field: string; has: boolean; chooseLabel: string; changeLabel: string; removeTitle: string; removeText: string;
  action: (f: FormData) => void | Promise<void>; remove: (f: FormData) => void | Promise<void>; hidden: Record<string, string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const fields = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <div className="flex flex-wrap gap-2">
      <form action={action} onSubmit={() => setSending(true)}>
        {fields}
        {/* The button opens the picker; the file input itself stays out of sight and out of the tab order. */}
        <input ref={input} type="file" name={field} accept={PICTURE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit(); }} />
        <button type="button" disabled={sending} onClick={() => input.current?.click()} className="btn btn-primary !min-h-10">
          <Icon name={sending ? 'hourglass_empty' : 'photo_camera'} />{sending ? 'Saving…' : has ? changeLabel : chooseLabel}
        </button>
      </form>
      {has && (
        <form action={remove}>{fields}
          <ConfirmButton className="btn btn-ghost !min-h-10" icon="delete" title={removeTitle} text={removeText} confirm="Remove">Remove</ConfirmButton>
        </form>
      )}
    </div>
  );
}
