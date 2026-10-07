import { notFound } from 'next/navigation';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { FullReport, Summary } from '@/lib/types';

const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** The full report for signed-in people, otherwise the public summary (P-002). */
export async function loadVehicle(ref: string): Promise<{ kind: 'full'; report: FullReport } | { kind: 'summary'; summary: Summary }> {
  if (!REF.test(ref)) notFound();
  try {
    if (await isSignedIn()) {
      try {
        return { kind: 'full', report: await api<FullReport>(`/vehicles/${ref}/report`, { auth: true }) };
      } catch (err) {
        if (!(err instanceof ApiError) || (err.status !== 401 && err.status !== 403)) throw err;
      }
    }
    return { kind: 'summary', summary: await api<Summary>(`/vehicles/${ref}/summary`) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function requireFull<T>(ref: string, path: string): Promise<T | undefined> {
  if (!REF.test(ref)) notFound();
  if (!(await isSignedIn())) return undefined;
  try {
    return await api<T>(`/vehicles/${ref}/${path}`, { auth: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return undefined;
    throw err;
  }
}
