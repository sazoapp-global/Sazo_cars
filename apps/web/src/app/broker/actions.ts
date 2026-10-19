'use server';
// Broker actions: apply with a National ID (D-127), make and stop links. The API checks every permission.
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { IMAGE_TYPES, filesFrom, uploadEvidence } from '@/lib/upload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = ['whatsapp', 'tiktok', 'facebook', 'instagram', 'other'];
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const reason = (err: unknown, fallback: string) => (err instanceof ApiError && err.detail ? err.detail : fallback);
const back = (q: Record<string, string>): never => redirect(`/broker?${new URLSearchParams(q)}`);

export async function applyBroker(form: FormData) {
  const nin = text(form, 'nin').replace(/\s/g, '').toUpperCase();
  if (!/^C[MF][A-Z0-9]{12}$/.test(nin)) back({ error: 'Enter your National ID number: 14 characters starting with CM or CF.' });
  const [photo] = filesFrom(form, 'idPhoto');
  if (!photo) back({ error: 'Add a clear photo of your National ID.' });
  if (!IMAGE_TYPES.includes(photo!.type)) back({ error: 'The ID photo must be a JPEG, PNG or WebP image.' });
  let id = '';
  try { id = (await uploadEvidence(photo!, 'official_document')).id; } catch { back({ error: 'The photo could not be sent. Please try again.' }); }
  try { await api('/broker/application', { method: 'POST', auth: true, body: { nin, idPhotoEvidenceId: id } }); }
  catch (err) { back({ error: reason(err, 'Could not send your application.') }); }
  back({ done: 'Sent. SAZO will check your ID and tell you here.' });
}

export async function brokerLink(form: FormData) {
  const stock = text(form, 'stock');
  const channel = CHANNELS.includes(text(form, 'channel')) ? text(form, 'channel') : 'whatsapp';
  if (!UUID.test(stock)) back({ error: 'No such car.' });
  let token = '';
  try { token = (await api<{ token: string }>(`/broker/cars/${stock}/links`, { method: 'POST', auth: true, body: { channel } })).token; }
  catch (err) { back({ error: reason(err, 'Could not make the link.') }); }
  back({ link: token, ch: channel, car: stock });
}

export async function stopBrokerLink(form: FormData) {
  const link = text(form, 'link');
  if (UUID.test(link)) await api(`/broker/links/${link}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  redirect('/broker?tab=links&done=That+link+no+longer+works.');
}
