'use server';
import { api } from '@/lib/api';

export interface Notice { id: string; audience?: string; title: string; body: string; createdAt: string; read: boolean }

/** The person's notifications (announcements from SAZO for their groups), newest first. */
export async function loadNotifications(): Promise<{ unread: number; items: Notice[] } | null> {
  return api<{ unread: number; items: Notice[] }>('/me/announcements', { auth: true }).catch(() => null);
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length) await api('/me/announcements/read', { method: 'POST', auth: true, body: { ids } }).catch(() => undefined);
}
