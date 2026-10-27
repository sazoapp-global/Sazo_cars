// Sends one photo or document to the API as evidence (start, upload bytes, complete) with the signed-in
// person's token. Returns the evidence id and, when SAZO's photo checks flag it, the reason (X-01).
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { api } from './api';
import { CONVERTED_TYPES as CONVERTED, IMAGE_TYPES } from './upload-types';

export { IMAGE_TYPES };

export const isPicture = (f: File) => IMAGE_TYPES.includes(f.type) || CONVERTED.includes(f.type);
export const isPictureOrPdf = (f: File) => isPicture(f) || f.type === 'application/pdf';

export class UnreadablePicture extends Error {}

/** A JPEG or PNG stays as it is; any other picture is turned into a JPEG. */
export async function asStored(file: File): Promise<File> {
  if (!CONVERTED.includes(file.type)) return file;
  try {
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().jpeg({ quality: 85 }).toBuffer();
    return new File([new Uint8Array(jpeg)], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    throw new UnreadablePicture('This picture could not be read. Use a JPEG or PNG photo.');
  }
}

export async function uploadEvidence(picked: File, kind: string): Promise<{ id: string; problem?: string }> {
  const file = await asStored(picked);
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
