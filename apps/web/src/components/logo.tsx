import Image from 'next/image';
import Link from 'next/link';

/** The SAZO mark (from the original designs) and wordmark. */
export function Logo({ size = 32, tagline, href = '/' }: { size?: number; tagline?: string; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="SAZO home">
      <Image src="/images/sazo-logo.webp" alt="" width={size} height={size} className="rounded-lg" priority />
      <span className="leading-tight">
        <span className="block font-display text-xl font-extrabold tracking-tight text-primary">SAZO</span>
        {tagline && <span className="block text-xs font-medium text-label">{tagline}</span>}
      </span>
    </Link>
  );
}
