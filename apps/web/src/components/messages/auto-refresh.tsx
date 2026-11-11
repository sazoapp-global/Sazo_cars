'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** New messages arrive without a reload (D-173): the page asks again every few seconds while it is in view. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
