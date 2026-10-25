'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { safeNext } from '@/lib/phone';

export interface PersonDetails {
  userId: string; name: string; phone: string | null; email: string | null; emailVerified: boolean; gender: 'male' | 'female' | null; status: string;
  businesses: { organisationId: string; name: string; type: string; organisationStatus: string; role: string; status: string }[];
  /** SAZO staff's authenticator app (D-145); null for people without one. */
  authenticator: { setUp: boolean; backupCodesLeft: number } | null;
  identity: { checkId: string; status: string; nin: string; idPhotoEvidenceId: string; decisionReason: string | null; sentAt: string } | null;
}

/** One person's account for the console popup. The API checks the viewer is SAZO staff and audits the look. */
export async function personDetails(userId: string): Promise<PersonDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return api<PersonDetails>(`/admin/people/${userId}`, { auth: true }).catch(() => null);
}

/** A SAZO administrator clears someone's authenticator app; they set up a new one at their next log-in. */
export async function clearAuthenticator(form: FormData): Promise<void> {
  const userId = String(form.get('userId') ?? '');
  const back = safeNext(form.get('back'));
  const join = back.includes('?') ? '&' : '?';
  let msg: string;
  try {
    await api(`/admin/people/${userId}/authenticator/reset`, { method: 'POST', auth: true });
    msg = `done=${encodeURIComponent('Authenticator app cleared. They are signed out and set up a new one at their next log-in.')}`;
  } catch (err) {
    const text = err instanceof ApiError && err.status === 403 ? 'Only SAZO administrators can clear an authenticator app.'
      : err instanceof ApiError && err.status === 409 ? 'Another administrator must clear your own app.'
      : err instanceof ApiError && err.status === 404 ? 'This person has no authenticator app set up.' : 'Could not clear the app. Try again.';
    msg = `error=${encodeURIComponent(text)}`;
  }
  redirect(`${back}${join}${msg}`);
}
