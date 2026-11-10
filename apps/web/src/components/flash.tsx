'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/** How long a "done" note stays on screen before it fades away. */
export const FLASH_MS = 5000;
const FADE_MS = 400;

/**
 * A short "done" note that looks exactly as before, then fades out after a few
 * seconds. The timer pauses while the pointer or keyboard focus is on it. The
 * ?done= message is taken out of the address, so a refresh does not show it again.
 */
export function Flash({ className, children, param = 'done' }: { className?: string; children: ReactNode; param?: string }) {
  const [phase, setPhase] = useState<'shown' | 'fading' | 'gone'>('shown');
  const [paused, setPaused] = useState(false);

  // Each new ?done= (even the same words again) shows the note afresh, then the
  // message leaves the address so a refresh or Back does not bring it back.
  const fresh = useSearchParams().get(param);
  useEffect(() => {
    if (fresh === null) return;
    setPhase('shown');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch { /* the note still shows */ }
  }, [fresh, param]);

  useEffect(() => {
    if (paused || phase === 'gone') return;
    const t = setTimeout(() => setPhase((p) => (p === 'shown' ? 'fading' : 'gone')), phase === 'shown' ? FLASH_MS : FADE_MS);
    return () => clearTimeout(t);
  }, [paused, phase]);

  if (phase === 'gone') return null;
  return (
    <p
      role="status"
      className={className}
      style={{ transition: `opacity ${FADE_MS}ms ease`, opacity: phase === 'fading' ? 0 : 1 }}
      onMouseEnter={() => { setPaused(true); setPhase('shown'); }}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => { setPaused(true); setPhase('shown'); }}
      onBlur={() => setPaused(false)}
    >
      {children}
    </p>
  );
}
