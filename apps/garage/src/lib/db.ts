// Everything the phone keeps, in IndexedDB: unfinished jobs, their photos, the sign-in, and a copy of the
// recent-jobs list so the app still shows something with no signal. Nothing is lost if the app is closed.
import type { JobForm, WorkType } from '@sazo/contracts';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type PhotoSlot = 'odometer' | 'engine' | 'receipt' | 'plate';

export interface LocalDraft {
  jobId: string;
  orgId: string;
  plateEntered: string;
  vehicleRef?: string;
  vehicleLabel?: string;
  /** The car was not found at lookup: a plate photo is required (D-057). */
  newToSazo?: boolean;
  workTypes: WorkType[];
  /** Form answers. Photo ids are filled in from `photos` when syncing. */
  form: JobForm;
  photos: Partial<Record<PhotoSlot, string>> & { extra: string[] };
  clientCreatedAt: string;
  serverVersion?: number;
  dirty: boolean;
  updatedAt: string;
  submitKey?: string;
  lastSyncError?: string;
  step: number;
}

export interface LocalPhoto {
  id: string;
  jobId: string;
  kind: 'odometer_photo' | 'engine_number_photo' | 'receipt' | 'plate_photo' | 'part_photo';
  blob: Blob;
  mime: string;
  size: number;
  sha256: string;
  capturedAt: string;
  evidenceId?: string;
}

interface GarageDb extends DBSchema {
  drafts: { key: string; value: LocalDraft; indexes: { byOrg: string } };
  photos: { key: string; value: LocalPhoto; indexes: { byJob: string } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<GarageDb>> | undefined;
export function db(): Promise<IDBPDatabase<GarageDb>> {
  dbp ??= openDB<GarageDb>('sazo-garage', 1, {
    upgrade(d) {
      d.createObjectStore('drafts', { keyPath: 'jobId' }).createIndex('byOrg', 'orgId');
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('byJob', 'jobId');
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export const kv = {
  get: async <T>(key: string) => (await (await db()).get('kv', key)) as T | undefined,
  set: async (key: string, value: unknown) => { await (await db()).put('kv', value, key); },
  del: async (key: string) => { await (await db()).delete('kv', key); },
};

export async function saveDraft(d: LocalDraft): Promise<void> {
  await (await db()).put('drafts', { ...d, updatedAt: new Date().toISOString() });
}
export async function getDraft(jobId: string) { return (await db()).get('drafts', jobId); }
export async function draftsFor(orgId: string) {
  return (await (await db()).getAllFromIndex('drafts', 'byOrg', orgId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function savePhoto(p: LocalPhoto) { await (await db()).put('photos', p); }
export async function getPhoto(id: string) { return (await db()).get('photos', id); }

/** After a job is submitted its local copy (including the customer's phone number) is removed from the phone. */
export async function forgetJob(jobId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['drafts', 'photos'], 'readwrite');
  for (const p of await tx.objectStore('photos').index('byJob').getAllKeys(jobId)) await tx.objectStore('photos').delete(p);
  await tx.objectStore('drafts').delete(jobId);
  await tx.done;
}

/** Signing out clears everything on the phone. */
export async function wipe(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear('drafts'), d.clear('photos'), d.clear('kv')]);
}
