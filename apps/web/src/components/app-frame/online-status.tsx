'use client';
// Online or offline, in the dealer console's top bar (as in the garage app, 25 Oct 2026).
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';

export function OnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  return (
    <span aria-live="polite" className={`chip shrink-0 !border-0 ${online ? 'bg-soft text-ok-text' : 'bg-lime text-ink'}`}>
      <Icon name={online ? 'cloud_done' : 'wifi_off'} size={14} />{online ? 'Online' : 'Offline'}
    </span>
  );
}
