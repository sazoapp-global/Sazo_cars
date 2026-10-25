'use client';
// Keeps the fixed side bar exactly under the top bars: adds up their heights into --site-top.
import { useEffect } from 'react';

export function TopMeasure({ targets }: { targets: string[] }) {
  useEffect(() => {
    const els = targets.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const set = () => document.documentElement.style.setProperty('--site-top', `${els.reduce((h, e) => h + e.offsetHeight, 0)}px`);
    set();
    const ro = new ResizeObserver(set);
    els.forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  }, [targets]);
  return null;
}
