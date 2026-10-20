// Reads a dealer's file of cars (Excel .xlsx or CSV) into rows keyed by SAZO's column keys (D-131). The API
// checks every row again; this only turns the file into plain text cells.
import { DEALER_IMPORT_MAX_ROWS, importHeaderKey } from '@sazo/contracts';
import { readSheet } from 'read-excel-file/node';
import { csvRecords } from '@/lib/csv';

/** Files bigger than this are refused before they are opened (a spreadsheet of 200 cars is far smaller). */
export const MAX_FILE_BYTES = 1_000_000;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim().slice(0, 600);
}

/** Rows keyed by column key, skipping empty rows. Columns SAZO does not read are ignored. */
function keyed(header: string[], rows: unknown[][]): { rows: Record<string, string>[]; known: number } {
  const keys = header.map((h) => importHeaderKey(cellText(h)));
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const o: Record<string, string> = {};
    keys.forEach((k, i) => { if (k) { const t = cellText(r[i]); if (t) o[k] = t; } });
    if (Object.keys(o).length) out.push(o);
  }
  return { rows: out, known: keys.filter(Boolean).length };
}

export type ReadResult = { ok: true; rows: Record<string, string>[] } | { ok: false; error: string };

export async function readCarsFile(file: File): Promise<ReadResult> {
  if (file.size === 0) return { ok: false, error: 'Choose your Excel or CSV file.' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'The file is larger than 1 MB. Split it into smaller files.' };
  const name = file.name.toLowerCase();
  let header: unknown[];
  let body: unknown[][];
  try {
    if (name.endsWith('.xlsx') || file.type === XLSX) {
      const sheet = await readSheet(Buffer.from(await file.arrayBuffer()));
      [header = [], ...body] = sheet as unknown[][];
    } else if (name.endsWith('.csv') || file.type === 'text/csv') {
      const { header: h, records } = csvRecords(await file.text());
      header = h;
      body = records.map((r) => h.map((c) => r[c] ?? ''));
    } else {
      return { ok: false, error: 'Use an Excel file (.xlsx) or a CSV file. Older .xls files: open them in Excel and save as .xlsx.' };
    }
  } catch {
    return { ok: false, error: 'SAZO could not open this file. Save it again as .xlsx or .csv and try again.' };
  }
  const { rows, known } = keyed(header.map(cellText), body);
  if (known < 2) return { ok: false, error: 'The first row should have the column names from the template (Make, Model, Asking price (UGX) and so on). Download the template to see them.' };
  if (!rows.length) return { ok: false, error: 'The file has no cars in it. Put one car on each row under the column names.' };
  if (rows.length > DEALER_IMPORT_MAX_ROWS) return { ok: false, error: `A file can have up to ${DEALER_IMPORT_MAX_ROWS} cars. Split it into smaller files.` };
  return { ok: true, rows };
}
