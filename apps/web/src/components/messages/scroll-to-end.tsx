'use client';
import { useEffect } from 'react';

/** A conversation opens at its newest message, and follows new ones as they arrive (D-173). */
export function ScrollToEnd({ list, count }: { list: string; count: number }) {
  useEffect(() => {
    const el = document.getElementById(list);
    if (!el) return;
    el.scrollTop = el.scrollHeight; // the list scrolls on computers
    el.lastElementChild?.scrollIntoView({ block: 'nearest' }); // the page scrolls on phones
  }, [list, count]);
  return null;
}
