// Everything the phone keeps, in IndexedDB: unfinished jobs, their photos, the sign-in, and a copy of the
// recent-jobs list so the app still shows something with no signal. Nothing is lost if the app is closed.
import type { InspectionForm, JobForm, WorkType } from '@sazo/contracts';
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
  kind: 'odometer_photo' | 'engine_number_photo' | 'receipt' | 'plate_photo' | 'part_photo' | 'vehicle_photo';
  blob: Blob;
  mime: string;
  size: number;
  sha256: string;
  capturedAt: string;
  evidenceId?: string;
}

/** Photo slots on an inspection: the odometer, the chassis stamp, and the car itself. */
export const CAR_PHOTO_SLOTS = [['front', 'Front of the car', true], ['back', 'Back of the car', true], ['left', 'Left side', false],
  ['right', 'Right side', false], ['damage1', 'Damage or defect', false], ['damage2', 'Another damage or defect', false]] as const;
export type InspectionPhotoSlot = 'odometer' | 'chassis' | (typeof CAR_PHOTO_SLOTS)[number][0];

/** An inspection being filled in on the phone (P-004). `id` doubles as the photos' jobId. */
export interface LocalInspection {
  id: string;
  orgId: string;
  plateEntered: string;
  vehicleRef?: string;
  vehicleLabel?: string;
  /** Not found at lookup: the chassis number must be read off the car. */
  newToSazo?: boolean;
  form: InspectionForm;
  photos: Partial<Record<InspectionPhotoSlot, string>>;
  clientCreatedAt: string;
  serverVersion?: number;
  dirty: boolean;
  updatedAt: string;
  submitKey?: string;
  lastSyncError?: string;
  step: number;
}

interface GarageDb extends DBSchema {
  drafts: { key: string; value: LocalDraft; indexes: { byOrg: string } };
  inspections: { key: string; value: LocalInspection; indexes: { byOrg: string } };
  photos: { key: string; value: LocalPhoto; indexes: { byJob: string } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<GarageDb>> | undefined;
export function db(): Promise<IDBPDatabase<GarageDb>> {
  dbp ??= openDB<GarageDb>('sazo-garage', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('drafts', { keyPath: 'jobId' }).createIndex('byOrg', 'orgId');
        d.createObjectStore('photos', { keyPath: 'id' }).createIndex('byJob', 'jobId');
        d.createObjectStore('kv');
      }
      if (oldVersion < 2) d.createObjectStore('inspections', { keyPath: 'id' }).createIndex('byOrg', 'orgId');
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

export async function saveInspection(i: LocalInspection): Promise<void> {
  await (await db()).put('inspections', { ...i, updatedAt: new Date().toISOString() });
}
export async function getInspection(id: string) { return (await db()).get('inspections', id); }
export async function inspectionsFor(orgId: string) {
  return (await (await db()).getAllFromIndex('inspections', 'byOrg', orgId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** After an inspection is sent its local copy and photos are removed from the phone. */
export async function forgetInspection(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['inspections', 'photos'], 'readwrite');
  for (const p of await tx.objectStore('photos').index('byJob').getAllKeys(id)) await tx.objectStore('photos').delete(p);
  await tx.objectStore('inspections').delete(id);
  await tx.done;
}

/** Signing out clears everything on the phone. */
export async function wipe(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear('drafts'), d.clear('inspections'), d.clear('photos'), d.clear('kv')]);
}
