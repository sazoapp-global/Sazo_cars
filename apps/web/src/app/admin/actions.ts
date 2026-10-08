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
