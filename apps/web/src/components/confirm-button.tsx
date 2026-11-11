'use client';
import { useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon, type IconName } from './icon';

type Photo = { src: string; caption?: string; name: string };

/**
 * A button that asks first (D-170, 11 Nov 2026): before anything is removed, a popup asks the question with one
 * short line, "Keep it" (focused, so Enter does no harm) and the red button that does it. The × at the top right
 * closes it, as do Escape and a tap outside. Put it inside the form instead of its submit button: the red button
 * submits that form with the same name, value and formAction, after the form's own checks (a reason, say) pass.
 */
export function ConfirmButton({
  children, className, label, title, text, confirm, keep = 'Keep it', icon = 'delete', photo, centred, name, value, formAction,
}: {
  children: ReactNode; className?: string; label?: string;
  title: string; text: string; confirm: string; keep?: string; icon?: IconName; photo?: Photo; centred?: boolean;
  name?: string; value?: string; formAction?: (form: FormData) => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const ask = () => {
    const form = trigger.current?.form;
    if (form && !form.reportValidity()) return;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('[data-keep]')?.focus();
  };
  const close = () => dialog.current?.close();
  return (
    <>
      <button ref={trigger} type="button" className={className} aria-label={label} aria-haspopup="dialog" onClick={ask}>{children}</button>
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby={heading} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        {photo ? (
          <div className="confirm-photo" style={{ backgroundImage: `url("${photo.src}")` }}>
            <div className="absolute bottom-3.5 left-5 right-16 text-white">
              {photo.caption && <p className="text-[13px] opacity-90">{photo.caption}</p>}
              <p className="font-display text-xl font-extrabold leading-tight">{photo.name}</p>
            </div>
            <CloseButton onClose={close} onPhoto />
          </div>
        ) : <CloseButton onClose={close} />}
        <div className={centred ? 'px-6 pt-6 text-center' : photo ? 'px-5 pt-5' : 'flex gap-3.5 py-5 pl-5 pr-14'}>
          {!photo && (
            <span className={centred ? 'confirm-badge confirm-badge-big' : 'confirm-badge'}><Icon name={icon} size={centred ? 30 : 22} /></span>
          )}
          <div className={centred ? 'mt-3.5' : 'min-w-0 flex-1'}>
            <h2 id={heading} className="font-display text-[1.3rem] font-extrabold leading-tight text-ink">{title}</h2>
            <p className="mt-1.5 text-muted">{text}</p>
          </div>
        </div>
        <Buttons keep={keep} confirm={confirm} name={name} value={value} formAction={formAction} onKeep={close} compact={!photo && !centred} withIcon={!!photo} />
      </dialog>
    </>
  );
}

function CloseButton({ onClose, onPhoto }: { onClose: () => void; onPhoto?: boolean }) {
  return (
    <button type="button" aria-label="Close" onClick={onClose} className={`confirm-close ${onPhoto ? 'confirm-close-photo' : ''}`}>
      <Icon name="close" size={20} />
    </button>
  );
}

function Buttons({ keep, confirm, name, value, formAction, onKeep, compact, withIcon }: {
  keep: string; confirm: string; name?: string; value?: string; formAction?: (form: FormData) => void | Promise<void>; onKeep: () => void; compact: boolean; withIcon: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div className={`flex gap-2.5 p-5 ${compact ? 'pt-0 sm:justify-end' : ''}`}>
      {/* The safe choice gets focus when the popup opens, so Enter keeps things as they are. */}
      <button type="button" data-keep onClick={onKeep} className={`btn btn-ghost confirm-keep ${compact ? 'max-sm:flex-1' : 'flex-1'}`}>{keep}</button>
      <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={`btn confirm-go ${compact ? 'max-sm:flex-1' : 'flex-1'}`}>
        {withIcon && <Icon name="delete" size={20} />}{pending ? 'One moment…' : confirm}
      </button>
    </div>
  );
}
