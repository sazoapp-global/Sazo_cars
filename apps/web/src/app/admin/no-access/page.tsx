import Link from 'next/link';
import { api } from '@/lib/api';
import { accessOf, homeFor } from '@/lib/access';
import type { Me } from '@/lib/types';

/** Not SAZO staff (D-172): say so, and offer the way to the person's own workspace. */
export default async function NoAccess() {
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  const home = me ? homeFor(accessOf(me)) : '/';
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold">SAZO staff only</h1>
      <p className="mt-1 text-muted">This part of SAZO is for SAZO reviewers and administrators.</p>
      <p className="mt-4"><Link href={home} className="btn btn-primary">{home === '/' ? 'Go to the home page' : 'Go to your page'}</Link></p>
    </div>
  );
}
