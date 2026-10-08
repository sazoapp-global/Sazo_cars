'use server';
import { createHash } from 'node:crypto';
import { DOMAIN_RECORD_TYPES, RECORD_LABELS, buildAttributes } from '@sazo/contracts';
import { ApiError, api } from '@/lib/api';
import { csvRecords } from '@/lib/csv';
import type { Submission } from '@/lib/types';

interface Item { identifiers: { vin?: string; chassisNumber?: string; plate?: string }; records: { type: string; attributes: Record<string, unknown>; time: { at: string; precision: 'day' } }[] }

/** A stable UUID from content, so re-sending the same file (or batch) can't create duplicates (X5). */
function keyFrom(text: string): string {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function itemFrom(v: Record<string, string>, domain: string): { item?: Item; errors: string[] } {
  const identifiers = { ...(v.vin ? { vin: v.vin } : {}), ...(v.chassis_number ? { chassisNumber: v.chassis_number } : {}), ...(v.plate ? { plate: v.plate } : {}) };
  const errors: string[] = [];
  if (!Object.keys(identifiers).length) errors.push('Give a VIN, chassis number or plate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? '') || Number.isNaN(Date.parse(v.date!))) errors.push('Date must look like 2024-06-14');
  else if (Date.parse(v.date!) > Date.now() + 86_400_000) errors.push('Date is in the future');
  const allowed = DOMAIN_RECORD_TYPES[domain] ?? [];
  if (!allowed.includes(v.record_type as never)) {
    return { errors: [...errors, `This source cannot send "${v.record_type || '(empty)'}". Allowed: ${allowed.map((t) => `${t} (${RECORD_LABELS[t]})`).join(', ')}`] };
  }
  const built = buildAttributes(v.record_type ?? '', v);
  if (!built.ok) errors.push(...built.errors.map((e) => e.message));
  if (errors.length || !built.ok) return { errors };
  return { item: { identifiers, records: [{ type: v.record_type!, attributes: built.attributes, time: { at: `${v.date}T09:00:00.000Z`, precision: 'day' } }] }, errors };
}

export type EntryState = { values?: Record<string, string>; errors?: string[]; result?: Submission };

/** One record typed into the form. */
export async function submitRecord(_prev: EntryState, form: FormData): Promise<EntryState> {
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)]));
  const { item, errors } = itemFrom(values, values.domain ?? '');
  if (!item) return { values, errors };
  try {
    const result = await api<Submission>('/ingest/submissions', {
      method: 'POST', auth: true, headers: { 'Idempotency-Key': values.idempotencyKey!, 'X-Source-Code': values.source! }, body: { schemaVersion: 1, items: [item] },
    });
    return { result };
  } catch (err) {
    return { values, errors: [err instanceof ApiError ? (err.status === 403 ? 'You cannot send records for this source.' : err.detail ?? err.code) : 'Could not send. Try again.'] };
  }
}

export type UploadState = {
  fileName?: string;
  total?: number;
  rows?: { row: number; status: 'accepted' | 'rejected' | 'needs_review' | 'invalid'; vehicleRef?: string; message?: string }[];
  submissionIds?: string[];
  error?: string;
};

const MAX_ROWS = 5000;
const BATCH = 500;

/** A CSV file: every row is checked first; good rows are sent in batches; each row gets its own result. */
export async function uploadCsv(_prev: UploadState, form: FormData): Promise<UploadState> {
  const source = String(form.get('source') ?? '');
  const domain = String(form.get('domain') ?? '');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV file.' };
  if (file.size > 5_000_000) return { error: 'The file is larger than 5 MB. Split it into smaller files.' };
  const text = await file.text();
  const { header, records } = csvRecords(text);
  for (const col of ['record_type', 'date']) if (!header.includes(col)) return { error: `The file needs a "${col}" column. Download the template to see the columns.` };
  if (!records.length) return { error: 'The file has no rows.' };
  if (records.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} rows per file.` };

  const rows: NonNullable<UploadState['rows']> = [];
  const good: { row: number; item: Item }[] = [];
  records.forEach((r, i) => {
    const { item, errors } = itemFrom(r, domain);
    if (item) good.push({ row: i + 2, item }); else rows.push({ row: i + 2, status: 'invalid', message: errors.join('; ') });
  });
  const submissionIds: string[] = [];
  try {
    for (let b = 0; b < good.length; b += BATCH) {
      const batch = good.slice(b, b + BATCH);
      const res = await api<Submission>('/ingest/submissions', {
        method: 'POST', auth: true, headers: { 'Idempotency-Key': keyFrom(`${source}\n${b}\n${text}`), 'X-Source-Code': source },
        body: { schemaVersion: 1, items: batch.map((g) => g.item) },
      });
      submissionIds.push(res.submissionId);
      for (const it of res.items) {
        const g = batch[it.sequence - 1]!;
        rows.push({ row: g.row, status: it.status === 'pending' ? 'needs_review' : it.status, vehicleRef: it.vehicleRef, message: it.errors.map((e) => e.message).join('; ') || undefined });
      }
    }
  } catch (err) {
    return { fileName: file.name, total: records.length, rows: rows.sort((a, b) => a.row - b.row), submissionIds, error: err instanceof ApiError && err.status === 403 ? 'You cannot send records for this source.' : 'Sending stopped part-way. Upload the same file again: rows already received will not be duplicated.' };
  }
  return { fileName: file.name, total: records.length, rows: rows.sort((a, b) => a.row - b.row), submissionIds };
}
