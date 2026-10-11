'use client';
import { useState } from 'react';
import { Icon } from '@/components/icon';

/** Password input with the design's show/hide eye. */
export function PasswordField({ id, name, label, autoComplete, minLength, error, describedBy }:
  { id: string; name: string; label: string; autoComplete: string; minLength?: number; error?: string; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input id={id} name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength}
          className="field !bg-soft !pr-12 focus:!bg-white" aria-invalid={!!error} aria-describedby={[describedBy, error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-label hover:text-primary-container">
          <Icon name={shown ? 'visibility_off' : 'visibility'} />
        </button>
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-bad-text">{error}</p>}
    </div>
  );
}
