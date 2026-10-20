'use server';
import { api } from '@/lib/api';

export interface PersonDetails {
  userId: string; name: string; phone: string | null; email: string | null; emailVerified: boolean; gender: 'male' | 'female' | null; status: string;
  businesses: { organisationId: string; name: string; type: string; organisationStatus: string; role: string; status: string }[];
  identity: { checkId: string; status: string; nin: string; idPhotoEvidenceId: string; decisionReason: string | null; sentAt: string } | null;
}

/** One person's account for the console popup. The API checks the viewer is SAZO staff and audits the look. */
export async function personDetails(userId: string): Promise<PersonDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return api<PersonDetails>(`/admin/people/${userId}`, { auth: true }).catch(() => null);
}
