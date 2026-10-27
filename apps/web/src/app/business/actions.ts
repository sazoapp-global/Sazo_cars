'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';
import { UnreadablePicture, filesFrom, isPicture, isPictureOrPdf, uploadEvidence } from '@/lib/upload';

export type RegisterState = { error?: string; fields?: Record<string, string> };
const TYPES = ['garage', 'dealer', 'inspector', 'inspection_centre'];

export async function registerBusiness(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const f = Object.fromEntries(['type', 'legalName', 'tradingName', 'registrationNumber', 'district', 'contactPhone'].map((k) => [k, String(form.get(k) ?? '').trim()]));
  if (!TYPES.includes(f.type!)) return { error: 'Choose what your business does.', fields: f };
  if (f.legalName!.length < 2) return { error: 'Enter the registered name of the business.', fields: f };
  const phone = f.contactPhone ? toE164(f.contactPhone) : undefined;
  if (f.contactPhone && !phone) return { error: 'Check the contact phone number, e.g. 0772 123 456.', fields: f };
  let id: string;
  try {
    id = (await api<{ id: string }>('/organisations', { method: 'POST', auth: true, body: {
      type: f.type, legalName: f.legalName, ...(f.tradingName ? { tradingName: f.tradingName } : {}),
      ...(f.registrationNumber ? { registrationNumber: f.registrationNumber } : {}), ...(f.district ? { district: f.district } : {}), ...(phone ? { contactPhone: phone } : {}),
    } })).id;
  } catch (err) {
    return { error: err instanceof ApiError && err.status === 401 ? 'Please sign in again.' : 'We could not register the business. Please try again.', fields: f };
  }
  // A dealer goes straight into the dealer console and prepares stock while SAZO checks the business.
  redirect(f.type === 'dealer' ? `/dealer/${id}?new=1` : `/business/${id}?new=1`);
}


/** Documents go through this server so the sign-in never leaves it: hash → reserve → bytes → complete → attach. */
export async function sendDocuments(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const back = (q: string) => redirect(`/business/${id}?${q}`);
  const files = form.getAll('documents').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back('error=Choose at least one file.');
  if (files.some((f) => !isPictureOrPdf(f))) back('error=Use JPEG or PNG photos, or PDF files.');
  if (files.some((f) => f.size > 8_000_000)) back('error=Each file must be under 8 MB.');
  const ids: string[] = [];
  try {
    for (const file of files) ids.push((await uploadEvidence(file, 'org_verification_document')).id);
    await api(`/organisations/${id}/verification-documents`, { method: 'POST', auth: true, body: { evidenceIds: ids } });
  } catch (err) {
    back('error=' + encodeURIComponent(err instanceof UnreadablePicture ? err.message : 'The documents could not be sent. Please try again.'));
  }
  back(`done=${encodeURIComponent(`${ids.length} ${ids.length === 1 ? 'document' : 'documents'} sent to SAZO.`)}`);
}

/** A-05: the manager's National ID number and a photo of their ID, for SAZO to check with the business. */
export async function sendIdentity(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const back = (q: string) => redirect(`/business/${id}?${q}#identity`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/account');
  const nin = String(form.get('nin') ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^C[MF][A-Z0-9]{12}$/.test(nin)) back('error=' + encodeURIComponent('Enter your National ID number: 14 letters and numbers starting with CM or CF.'));
  const [photo] = filesFrom(form, 'idPhoto');
  if (!photo) back('error=' + encodeURIComponent('Add a photo of your National ID.'));
  if (!isPicture(photo!)) back('error=' + encodeURIComponent('The ID photo must be a JPEG or PNG picture.'));
  try {
    const up = await uploadEvidence(photo!, 'official_document');
    await api('/me/identity', { method: 'POST', auth: true, body: { nin, idPhotoEvidenceId: up.id } });
  } catch (err) {
    back('error=' + encodeURIComponent(err instanceof UnreadablePicture ? err.message : err instanceof ApiError && err.detail ? err.detail : 'Your ID could not be sent. Please try again.'));
  }
  back('done=' + encodeURIComponent('Your National ID was sent. SAZO checks it with your business.'));
}
