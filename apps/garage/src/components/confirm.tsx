import { useEffect, useId, useRef } from 'react';
import { Icon, type IconName } from './icon';

/**
 * The popup that asks first (D-170, as on the website): the question, one short line, "Keep it" (focused, so Enter
 * does no harm) and the red button. The × at the top right closes it, as do Escape and a tap outside.
 */
export function Confirm({ open, title, text, confirm, keep = 'Keep it', icon = 'warning', onConfirm, onClose }: {
  open: boolean; title: string; text: string; confirm: string; keep?: string; icon?: IconName; onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLButtonElement>('[data-keep]')?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={heading} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" aria-label="Close" onClick={onClose} className="confirm-close"><Icon name="close" size={20} /></button>
      <div className="flex gap-3.5 py-5 pl-5 pr-14">
        <span className="confirm-badge"><Icon name={icon} size={22} /></span>
        <div className="min-w-0 flex-1">
          <h2 id={heading} className="font-display text-[1.3rem] font-extrabold leading-tight text-ink">{title}</h2>
          <p className="mt-1.5 text-muted">{text}</p>
        </div>
      </div>
      <div className="flex gap-2.5 p-5 pt-0 sm:justify-end">
        <button type="button" data-keep onClick={onClose} className="btn btn-ghost max-sm:flex-1">{keep}</button>
        <button type="button" onClick={onConfirm} className="btn confirm-go max-sm:flex-1">{confirm}</button>
      </div>
    </dialog>
  );
}
