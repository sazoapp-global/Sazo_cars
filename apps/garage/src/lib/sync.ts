// Sends what's on the phone to SAZO when there is signal: photos first (reserve → bytes → complete),
// then the draft itself (PUT by its phone-made id, with the version last seen). Safe to run any time, any
// number of times: every step is idempotent.
import type { InspectionForm, JobForm } from '@sazo/contracts';
import { ApiError, OfflineError, request } from './api';
import { CAR_PHOTO_SLOTS, draftsFor, getDraft, getInspection, getPhoto, inspectionsFor, saveDraft, saveInspection, savePhoto, type LocalDraft, type LocalInspection } from './db';

/** Upload one photo if it isn't on the server yet; returns its evidence id. */
export async function uploadPhoto(photoId: string): Promise<string> {
  const p = await getPhoto(photoId);
  if (!p) throw new Error('photo missing on this phone');
  if (p.evidenceId) return p.evidenceId;
  const slot = await request<{ evidenceId: string; uploadUrl: string }>('/evidence/uploads', {
    method: 'POST', body: { kind: p.kind, mimeType: p.mime, sizeBytes: p.size, sha256: p.sha256, capturedAt: p.capturedAt },
  });
  const path = new URL(slot.uploadUrl, location.origin).pathname.replace(/^\/v1/, '');
  await request(path, { method: 'PUT', rawBody: p.blob, headers: { 'Content-Type': p.mime } });
  await request(`/evidence/${slot.evidenceId}/complete`, { method: 'POST' });
  await savePhoto({ ...p, evidenceId: slot.evidenceId });
  return slot.evidenceId;
}

/** The form as the API expects it: local photo ids replaced by uploaded evidence ids. */
export async function formForServer(d: LocalDraft): Promise<JobForm> {
  const ids = async (local?: string) => (local ? uploadPhoto(local) : undefined);
  const [odometer, engine, receipt, plate, extra] = await Promise.all([
    ids(d.photos.odometer), ids(d.photos.engine), ids(d.photos.receipt), ids(d.photos.plate),
    Promise.all(d.photos.extra.map((x) => uploadPhoto(x))),
  ]);
  const f: JobForm = structuredClone(d.form);
  if (f.mileage) f.mileage = { ...f.mileage, ...(odometer ? { odometerPhotoId: odometer } : {}) };
  if (f.engine && engine) f.engine = { ...f.engine, newEngineNumberPhotoId: engine };
  if (f.cost && receipt) f.cost = { ...f.cost, receiptPhotoId: receipt };
  const evidenceIds = [...(plate ? [plate] : []), ...extra];
  if (evidenceIds.length) f.evidenceIds = evidenceIds;
  return f;
}

export type SyncResult = 'synced' | 'offline' | 'not_editable' | 'error';

export async function syncDraft(jobId: string): Promise<SyncResult> {
  const d = await getDraft(jobId);
  if (!d || !d.dirty) return 'synced';
  try {
    const form = await formForServer(d);
    const body = { plateEntered: d.plateEntered, ...(d.vehicleRef ? { vehicleRef: d.vehicleRef } : {}), workTypes: d.workTypes, clientCreatedAt: d.clientCreatedAt, form };
    let saved: { version: number };
    try {
      saved = await request<{ version: number }>(`/garage/jobs/${d.jobId}`, { method: 'PUT', org: d.orgId, body: { ...body, ...(d.serverVersion ? { version: d.serverVersion } : {}) } });
    } catch (err) {
      // Changed elsewhere (another device or a lost reply): this phone holds the newest answers, so it wins.
      if (!(err instanceof ApiError && err.code === 'version_conflict')) throw err;
      saved = await request<{ version: number }>(`/garage/jobs/${d.jobId}`, { method: 'PUT', org: d.orgId, body });
    }
    const latest = await getDraft(jobId);
    // Only clear "dirty" if nothing changed on the phone while we were uploading.
    if (latest) await saveDraft({ ...latest, serverVersion: saved.version, dirty: latest.updatedAt !== d.updatedAt, lastSyncError: undefined });
    return 'synced';
  } catch (err) {
    if (err instanceof OfflineError) return 'offline';
    const latest = await getDraft(jobId);
    if (err instanceof ApiError && err.code === 'job_not_editable') {
      if (latest) await saveDraft({ ...latest, dirty: false, lastSyncError: 'Already submitted' });
      return 'not_editable';
    }
    if (latest) await saveDraft({ ...latest, lastSyncError: err instanceof Error ? err.message : 'Could not sync' });
    return 'error';
  }
}

/** The checklist as the API expects it: local photo ids replaced by uploaded evidence ids. */
export async function inspectionForServer(i: LocalInspection): Promise<InspectionForm> {
  const up = async (local?: string) => (local ? uploadPhoto(local) : undefined);
  const [odometer, chassis, ...car] = await Promise.all([up(i.photos.odometer), up(i.photos.chassis), ...CAR_PHOTO_SLOTS.map(([slot]) => up(i.photos[slot]))]);
  const f: InspectionForm = structuredClone(i.form);
  if (f.mileage) f.mileage = { ...f.mileage, ...(odometer ? { odometerPhotoId: odometer } : {}) };
  if (f.identity && chassis) f.identity = { ...f.identity, chassisPhotoId: chassis };
  const photoIds = car.filter((x): x is string => !!x);
  if (photoIds.length) f.photoIds = photoIds;
  return f;
}

export async function syncInspection(id: string): Promise<SyncResult> {
  const i = await getInspection(id);
  if (!i || !i.dirty) return 'synced';
  try {
    const form = await inspectionForServer(i);
    const body = { plateEntered: i.plateEntered, ...(i.vehicleRef ? { vehicleRef: i.vehicleRef } : {}), clientCreatedAt: i.clientCreatedAt, form };
    let saved: { version: number };
    try {
      saved = await request<{ version: number }>(`/inspections/${i.id}`, { method: 'PUT', org: i.orgId, body: { ...body, ...(i.serverVersion ? { version: i.serverVersion } : {}) } });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'version_conflict')) throw err;
      saved = await request<{ version: number }>(`/inspections/${i.id}`, { method: 'PUT', org: i.orgId, body });
    }
    const latest = await getInspection(id);
    if (latest) await saveInspection({ ...latest, serverVersion: saved.version, dirty: latest.updatedAt !== i.updatedAt, lastSyncError: undefined });
    return 'synced';
  } catch (err) {
    if (err instanceof OfflineError) return 'offline';
    const latest = await getInspection(id);
    if (err instanceof ApiError && err.code === 'not_editable') {
      if (latest) await saveInspection({ ...latest, dirty: false, lastSyncError: 'Already sent' });
      return 'not_editable';
    }
    if (latest) await saveInspection({ ...latest, lastSyncError: err instanceof Error ? err.message : 'Could not sync' });
    return 'error';
  }
}

let running: Promise<void> | undefined;
/** Sync every waiting draft for a garage or inspector (called on start, on "online", and after each save). */
export function syncAll(orgId: string): Promise<void> {
  running ??= (async () => {
    try {
      for (const d of await draftsFor(orgId)) {
        if (!d.dirty) continue;
        if ((await syncDraft(d.jobId)) === 'offline') return;
      }
      for (const i of await inspectionsFor(orgId)) {
        if (!i.dirty || i.plateEntered.length < 2) continue;
        if ((await syncInspection(i.id)) === 'offline') return;
      }
    } finally {
      running = undefined;
    }
  })();
  return running;
}
