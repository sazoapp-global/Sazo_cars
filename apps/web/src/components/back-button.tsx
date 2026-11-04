// The one way back (D-158, 4 Nov 2026): a white rounded "Back" button with a left arrow, top left above the
// title, on every page or view you leave by going back. It replaces the Close crosses on Settings, Notifications
// and Your data, and the small "← All cars"-style links. Pop-ups over a page keep their ✕.
import Link from 'next/link';
import { Icon } from './icon';

export const BACK_CLASS = 'inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line bg-card px-4 py-2 font-semibold text-primary-container shadow-sm hover:border-primary-container hover:bg-soft print:hidden';

export function BackButton({ href, className = '', scroll }: { href: string; className?: string; scroll?: boolean }) {
  return <Link href={href} scroll={scroll} className={`${BACK_CLASS} ${className}`}><Icon name="arrow_back" size={20} />Back</Link>;
}
