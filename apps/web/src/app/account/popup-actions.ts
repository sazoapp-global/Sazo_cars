'use server';
import { api } from '@/lib/api';

export interface MyAccount {
  name: string; initials: string; phone: string | null; email: string | null; emailVerified: boolean; hasPassword: boolean; hasGoogle: boolean;
  progress: { percent: number }; businesses: { name: string; yourRole: string; status: string }[];
}

/** The signed-in person's details for the header popup. */
export async function myAccount(): Promise<MyAccount | null> {
  try {
    const p = await api<MyAccount & { displayName: string; surname: string | null; firstName: string | null; middleName: string | null }>('/me/profile', { auth: true });
    return {
      name: [p.surname, p.firstName, p.middleName].filter(Boolean).join(' ') || p.displayName, initials: p.initials, phone: p.phone, email: p.email,
      emailVerified: p.emailVerified, hasPassword: p.hasPassword, hasGoogle: p.hasGoogle, progress: { percent: p.progress.percent },
      businesses: p.businesses.map((b) => ({ name: b.name, yourRole: b.yourRole, status: b.status })),
    };
  } catch {
    return null;
  }
}
