// Sends one photo or document to the API as evidence (start, upload bytes, complete) with the signed-in
// person's token. Returns the evidence id and, when SAZO's photo checks flag it, the reason (X-01).
import { createHash } from 'node:crypto';
import { api } from './api';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadEvidence(file: File, kind: string): Promise<{ id: string; problem?: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const slot = await api<{ evidenceId: string }>('/evidence/uploads', { method: 'POST', auth: true, body: {
    kind, mimeType: file.type, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
  await api(`/evidence/uploads/${slot.evidenceId}/content`, { method: 'PUT', auth: true, raw: { bytes, contentType: file.type } });
  const done = await api<{ checks?: { status: string; problems: { message: string }[] } }>(`/evidence/${slot.evidenceId}/complete`, { method: 'POST', auth: true });
  return { id: slot.evidenceId, ...(done.checks?.status === 'needs_checking' ? { problem: done.checks.problems[0]?.message ?? 'This photo could not be checked' } : {}) };
}

/** The files from a file input, ignoring the empty entry browsers send when nothing was picked. */
export function filesFrom(form: FormData, key: string): File[] {
  return form.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
}
