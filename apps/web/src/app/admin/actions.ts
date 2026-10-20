'use server';
// Every admin decision goes through the API, which checks permissions and writes the audit log.
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const back = (path: string, msg: string, ok = true): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${ok ? 'done' : 'error'}=${encodeURIComponent(msg)}`);
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const failure = (err: unknown) => (err instanceof ApiError ? (err.detail ?? err.code) : 'Something went wrong');

export async function decideOrganisation(form: FormData) {
  const id = text(form, 'id');
  const decision = text(form, 'decision');
  const reason = text(form, 'reason');
  if (reason.length < 3) back('/admin/organisations', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/organisations/${id}/decision`, { method: 'POST', auth: true, body: { decision, reason } });
  } catch (err) { back('/admin/organisations', failure(err), false); }
  back('/admin/organisations', `Decision recorded: ${decision.replace('_', ' ')}.`);
}

export async function actOnConflict(form: FormData) {
  const id = text(form, 'id');
  const action = text(form, 'action');
  const path = `/admin/conflicts/${id}`;
  const body: Record<string, unknown> = { action };
  for (const k of ['comment', 'interpretation', 'reasoning']) if (text(form, k)) body[k] = text(form, k);
  const keep = text(form, 'keepVehicleRef');
  if (keep && text(form, 'plate')) body.plateDispute = { plate: text(form, 'plate'), keepVehicleRef: keep };
  const correctsFrom = text(form, 'relationFrom');
  const correctsTo = text(form, 'relationTo');
  const kind = text(form, 'relationKind');
  if (correctsFrom && correctsTo && kind) body.relations = [{ kind, fromObservationId: correctsFrom, toObservationId: correctsTo }];
  try {
    await api(`/admin/conflicts/${id}/actions`, { method: 'POST', auth: true, body });
  } catch (err) { back(path, failure(err), false); }
  back(path, action === 'resolve' ? 'Resolved. The vehicle has been recalculated.' : action === 'dismiss' ? 'Dismissed.' : 'Saved.');
}

export async function decideMatch(form: FormData) {
  const id = text(form, 'decisionId');
  const [outcome, vehicleRef] = text(form, 'choice').split(':') as [string, string | undefined];
  const reason = text(form, 'reason');
  if (reason.length < 3) back('/admin/matches', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/resolutions/${id}/decide`, { method: 'POST', auth: true, body: { outcome, reason, ...(outcome === 'matched' ? { vehicleRef } : {}) } });
  } catch (err) { back('/admin/matches', failure(err), false); }
  back('/admin/matches', 'Decision recorded. The record has been processed.');
}

export async function updateSource(form: FormData) {
  const id = text(form, 'id');
  const status = text(form, 'status');
  const supersededBy = text(form, 'supersededBySourceId');
  const reason = text(form, 'reason');
  if (reason.length < 3) back('/admin/sources', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/sources/${id}`, { method: 'PATCH', auth: true, body: { ...(status ? { status } : {}), ...(supersededBy ? { supersededBySourceId: supersededBy } : {}), reason } });
  } catch (err) { back('/admin/sources', failure(err), false); }
  back('/admin/sources', 'Source updated. Affected vehicles have been recalculated.');
}

export async function startRebuild(form: FormData) {
  const vehicleRef = text(form, 'vehicleRef');
  if (text(form, 'confirm') !== 'yes') back('/admin/rebuild', 'Tick the box to confirm.', false);
  let n = 0;
  try {
    n = (await api<{ vehicles: number }>('/admin/rebuilds', { method: 'POST', auth: true, body: vehicleRef ? { vehicleRef: vehicleRef.toUpperCase() } : {} })).vehicles;
  } catch (err) { back('/admin/rebuild', failure(err), false); }
  back('/admin/rebuild', `Recalculated ${n} ${n === 1 ? 'vehicle' : 'vehicles'}.`);
}

export async function decideOwnership(form: FormData) {
  const decision = text(form, 'decision');
  const reason = text(form, 'reason');
  if (reason.length < 3) back('/admin/ownership', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/ownership-claims/${text(form, 'id')}/decision`, { method: 'POST', auth: true, body: { decision, reason } });
  } catch (err) { back('/admin/ownership', failure(err), false); }
  back('/admin/ownership', decision === 'approve' ? 'Approved. The owner has been sent a text.' : 'Rejected. The person has been sent a text.');
}

export async function decideConcern(form: FormData) {
  const decision = text(form, 'decision');
  const reason = text(form, 'reason');
  const vehicleRef = text(form, 'vehicleRef').toUpperCase();
  if (reason.length < 3) back('/admin/concerns', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/concerns/${text(form, 'id')}/decision`, { method: 'POST', auth: true, body: { decision, reason, ...(vehicleRef ? { vehicleRef } : {}) } });
  } catch (err) { back('/admin/concerns', failure(err), false); }
  back('/admin/concerns', decision === 'uphold' ? 'Upheld. Buyers now see what SAZO confirmed.' : 'Dismissed. The "being checked" notice is gone.');
}

export async function decideModeration(form: FormData) {
  const decision = text(form, 'decision');
  const reason = text(form, 'reason');
  if (reason.length < 3) back('/admin/moderation', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/moderation/${text(form, 'id')}/decision`, { method: 'POST', auth: true, body: { decision, reason } });
  } catch (err) { back('/admin/moderation', failure(err), false); }
  back('/admin/moderation', decision === 'approve' ? 'Published.' : 'Rejected.');
}

export async function decideBroker(form: FormData) {
  const id = text(form, 'id');
  const decision = text(form, 'decision') === 'approve' ? 'approve' : 'reject';
  const reason = text(form, 'reason');
  if (!/^[0-9a-f-]{36}$/i.test(id)) back('/admin/brokers', 'No such application.', false);
  if (reason.length < 3) back('/admin/brokers', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/brokers/applications/${id}/decision`, { method: 'POST', auth: true, body: { decision, reason } });
  } catch (err) { back('/admin/brokers', failure(err), false); }
  back('/admin/brokers', decision === 'approve' ? 'Approved. They can now use the broker marketplace.' : 'Rejected. They can see your reason.');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A-05: approve or reject one manager's National ID (managers added after their business was approved). */
export async function decideIdentity(form: FormData) {
  const id = text(form, 'id');
  const decision = text(form, 'decision') === 'approve' ? 'approve' : 'reject';
  const reason = text(form, 'reason');
  if (!UUID_RE.test(id)) back('/admin/identity', 'No such check.', false);
  if (reason.length < 3) back('/admin/identity', 'Write a reason (at least 3 characters).', false);
  try {
    await api(`/admin/identity-checks/${id}/decision`, { method: 'POST', auth: true, body: { decision, reason } });
  } catch (err) { back('/admin/identity', failure(err), false); }
  back('/admin/identity', decision === 'approve' ? 'ID approved. They get an SMS.' : 'Rejected. They see your reason and can send it again.');
}

/** A-06: send an announcement to everyone or one group. */
export async function sendAnnouncement(form: FormData) {
  const body = { audience: text(form, 'audience'), title: text(form, 'title'), body: text(form, 'body') };
  if (body.title.length < 3 || body.body.length < 3) back('/admin/announcements', 'Write a title and a message.', false);
  try { await api('/admin/announcements', { method: 'POST', auth: true, body }); }
  catch (err) { back('/admin/announcements', failure(err), false); }
  back('/admin/announcements', 'Announcement sent. It shows under the bell.');
}

export async function withdrawAnnouncement(form: FormData) {
  const id = text(form, 'id');
  if (!UUID_RE.test(id)) back('/admin/announcements', 'No such announcement.', false);
  try { await api(`/admin/announcements/${id}/withdraw`, { method: 'POST', auth: true }); }
  catch (err) { back('/admin/announcements', failure(err), false); }
  back('/admin/announcements', 'Withdrawn. People no longer see it.');
}

/** A-07: write a new help answer, or change one (its words, who it is for, or draft / published / hidden). */
export async function saveFaq(form: FormData) {
  const id = text(form, 'id');
  const fields = { audience: text(form, 'audience'), topic: text(form, 'topic'), question: text(form, 'question'), answer: text(form, 'answer'),
    status: text(form, 'status') || 'draft', position: Number(text(form, 'position') || '100') };
  const only = text(form, 'only');
  const body = only === 'status' ? { status: fields.status } : fields;
  try {
    if (id && UUID_RE.test(id)) await api(`/admin/faqs/${id}`, { method: 'PATCH', auth: true, body });
    else await api('/admin/faqs', { method: 'POST', auth: true, body });
  } catch (err) { back('/admin/faqs', failure(err), false); }
  back('/admin/faqs', id ? 'Saved. The change is kept in its history.' : 'Added.');
}
