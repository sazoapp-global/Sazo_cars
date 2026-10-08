import { DOMAIN_RECORD_TYPES, csvColumns } from '@sazo/contracts';
import { api, isSignedIn } from '@/lib/api';
import { csvCell } from '@/lib/csv';
import type { PartnerSource } from '@/lib/types';

/** The CSV template for a source: its columns plus one example row per kind of record it may send. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await isSignedIn())) return new Response('Sign in first', { status: 401 });
  const source = (await api<PartnerSource[]>('/ingest/sources', { auth: true })).find((s) => s.code === code);
  if (!source) return new Response('Not found', { status: 404 });
  const cols = csvColumns(source.domain);
  const examples = (DOMAIN_RECORD_TYPES[source.domain] ?? []).map((t) => cols.map((c) => (c === 'record_type' ? t : c === 'date' ? '2026-01-31' : c === 'chassis_number' ? 'NZT260-3000000' : '')));
  const body = [cols, ...examples].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sazo-${code.toLowerCase()}-template.csv"` } });
}
