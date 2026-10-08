import { redirect } from 'next/navigation';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';

/** SAZO staff only. The API checks every permission again; this just keeps others out of the screens. */
export async function requireStaff(next: string): Promise<Me & { isAdmin: boolean }> {
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const me = await api<Me>('/me', { auth: true }).catch((err) => {
    if (err instanceof ApiError && err.status === 401) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    throw err;
  });
  const isAdmin = me.platformRoles.includes('sazo_admin');
  if (!isAdmin && !me.platformRoles.includes('sazo_reviewer')) redirect('/admin/no-access');
  return { ...me, isAdmin };
}

/** Admin lists: an API 403 becomes an explanation instead of a crash. */
export async function adminFetch<T>(path: string): Promise<T | 'forbidden'> {
  try {
    return await api<T>(path, { auth: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return 'forbidden';
    throw err;
  }
}
