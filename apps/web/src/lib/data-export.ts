// A person's data held by SAZO (D-147): the same sections on the "Your data" page, in the PDF file and in
// the Excel file (one sheet per section). Downloads are PDF or Excel only; there is no JSON download.
import { formatDate } from '@sazo/contracts';
import PDFDocument from 'pdfkit';
import writeXlsxFile from 'write-excel-file/node';
import { deviceName, localPhone } from './phone';

export interface ExportBusiness {
  name: string; legalName: string; tradingName: string | null; type: string; yourRole: string; status: string;
  registrationNumber: string | null; district: string | null; registeredAt: string | null; documentsSent: number;
}
export interface DataExport {
  exportedAt: string; about: string;
  profile: { displayName?: string; phone?: string | null; email?: string | null; businesses: ExportBusiness[] };
  preferences: { visitConfirmationTexts: boolean };
  devices: { device: string | null; signedInAt: string; lastUsedAt: string; current: boolean }[];
  savedCars: { vehicleRef: string; savedAt: string }[];
  sharedReports: { snapshotRef: string; vehicleRef: string; plate: string | null; createdAt: string; expiresAt: string | null; revoked: boolean }[];
  myCars: { vehicleRef: string; status: string; method: string; claimedAt: string }[];
  reviews: { modelId: string; rating: number; body: string; status: string; createdAt: string }[];
  videoSuggestions: { modelId: string; url: string; title: string | null; status: string; createdAt: string }[];
}

export const BUSINESS_TYPE: Record<string, string> = { garage: 'Garage', dealer: 'Car dealer', inspector: 'Inspector', inspection_centre: 'Inspection centre', lender: 'Lender', insurer: 'Insurer', auction: 'Auction', rental: 'Rental company', importer: 'Importer' };
export const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
export const BUSINESS_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };
export const CLAIM: Record<string, string> = { verified: 'Confirmed owner', pending: 'Waiting for SAZO', rejected: 'Not confirmed' };
export const MODERATION: Record<string, string> = { pending: 'Waiting for review', published: 'Published', rejected: 'Not published', removed: 'Removed' };

const label = (map: Record<string, string>, v: string) => map[v] ?? v;
const shareState = (s: DataExport['sharedReports'][number]) => (s.revoked ? 'Link stopped' : s.expiresAt ? `Link until ${formatDate(s.expiresAt)}` : 'Link active');

/** One table per part of the data, with words a person can read (the Excel sheets and the PDF tables). */
export interface Sheet { name: string; title: string; columns: string[]; widths: number[]; rows: string[][]; /** In the PDF, each row as its own list (too many columns for a page). */ stack?: boolean }

export function sheetsOf(d: DataExport, whose: 'your' | 'their'): Sheet[] {
  const p = d.profile;
  const own = whose === 'your';
  return [
    { name: 'Details', title: own ? 'Your details' : 'Details', columns: ['Item', 'Value'], widths: [44, 44], rows: [
      ['Name', p.displayName ?? 'Not given'],
      ['Phone', p.phone ? localPhone(p.phone) : 'Not given'],
      ['Email', p.email ?? 'Not given'],
      ['Texts asking to confirm garage visits', d.preferences.visitConfirmationTexts ? 'On' : 'Off'],
      ['Prepared', formatDate(d.exportedAt)],
    ] },
    { name: 'Businesses', title: own ? 'Your businesses' : 'Businesses', stack: true, widths: [24, 16, 26, 18, 14, 22, 12, 16, 10],
      columns: ['Name', 'Type', 'Registered name', 'Registration number', 'District', 'Status', 'Role', 'Registered on SAZO', 'Documents sent'],
      rows: p.businesses.map((b) => [b.name, label(BUSINESS_TYPE, b.type), b.legalName, b.registrationNumber ?? 'Not recorded', b.district ?? 'Not recorded',
        label(BUSINESS_STATUS, b.status), label(ROLE, b.yourRole), b.registeredAt ? formatDate(b.registeredAt) : 'Not recorded', String(b.documentsSent)]) },
    { name: 'Cars owned', title: own ? 'Cars you own' : 'Cars owned', columns: ['Car', 'Status', 'Claimed on'], widths: [22, 22, 16],
      rows: d.myCars.map((c) => [c.vehicleRef, label(CLAIM, c.status), formatDate(c.claimedAt)]) },
    { name: 'Saved cars', title: 'Saved cars', columns: ['Car', 'Saved on'], widths: [22, 16],
      rows: d.savedCars.map((c) => [c.vehicleRef, formatDate(c.savedAt)]) },
    { name: 'Shared reports', title: own ? 'Reports you shared' : 'Shared reports', columns: ['Car', 'Report', 'Shared on', 'Link'], widths: [18, 22, 16, 24],
      rows: d.sharedReports.map((s) => [s.plate ?? s.vehicleRef, s.snapshotRef, formatDate(s.createdAt), shareState(s)]) },
    { name: 'Reviews', title: own ? 'Your reviews and video suggestions' : 'Reviews and video suggestions', columns: ['Kind', 'Rating or title', 'Words or link', 'Status', 'Sent on'], widths: [10, 18, 60, 18, 14],
      rows: [...d.reviews.map((r) => ['Review', `${r.rating}/5`, r.body, label(MODERATION, r.status), formatDate(r.createdAt)]),
        ...d.videoSuggestions.map((v) => ['Video', v.title ?? 'Video', v.url, label(MODERATION, v.status), formatDate(v.createdAt)])] },
    { name: 'Devices', title: 'Signed-in devices', columns: ['Device', 'Signed in', 'Last used'], widths: [30, 16, 16],
      rows: d.devices.map((x) => [`${deviceName(x.device)}${x.current && own ? ' (this device)' : ''}`, formatDate(x.signedInAt), formatDate(x.lastUsedAt)]) },
  ];
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The Excel file: one sheet per part, the first row the column names. */
export async function toXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const head = (cols: string[]) => cols.map((c) => ({ value: c, fontWeight: 'bold' as const, backgroundColor: '#E6ECFA' }));
  const buffer = await writeXlsxFile(sheets.map((s) => ({
    sheet: s.name, stickyRowsCount: 1,
    data: [head(s.columns), ...(s.rows.length ? s.rows : [s.columns.map((_, i) => (i === 0 ? 'None' : ''))]).map((r) => r.map((value) => ({ value, wrap: true })))],
    columns: s.widths.map((width) => ({ width })),
  }))).toBuffer();
  return new Uint8Array(buffer);
}

const NAVY = '#002177', LIME = '#bff100', INK = '#14182b', MUTED = '#5b6178', RULE = '#dde1ec', HEAD_FILL = '#e6ecfa';

/** The PDF file: a SAZO header, then each part as a table. */
export function toPdf(sheets: Sheet[], o: { title: string; note: string }): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 48, right: 48 }, bufferPages: true, info: { Title: o.title, Author: 'SAZO' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Uint8Array>((resolve) => doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks)))));
  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  doc.rect(0, 0, doc.page.width, 8).fill(LIME);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('SAZO', left, 30);
  doc.moveDown(0.6).fillColor(INK).fontSize(16).text(o.title);
  doc.moveDown(0.3).fillColor(MUTED).font('Helvetica').fontSize(9.5).text(o.note, { width });
  doc.moveDown(0.8);

  for (const s of sheets) {
    if (doc.y + 70 > bottom()) doc.addPage();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(s.title, left, doc.y);
    doc.moveDown(0.3);
    if (!s.rows.length) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('None.', left, doc.y);
      doc.moveDown(0.9);
      continue;
    }
    const total = s.widths.reduce((a, b) => a + b, 0);
    const colW = s.widths.map((w) => (w / total) * width);
    const pad = 4;
    const row = (cells: string[], header: boolean) => {
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8.5 : 9);
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: colW[i]! - pad * 2 }))) + pad * 2;
      if (doc.y + h > bottom()) { doc.addPage(); if (!header) row(s.columns, true); }
      const y = doc.y;
      if (header) doc.rect(left, y, width, h).fill(HEAD_FILL);
      let x = left;
      cells.forEach((c, i) => {
        doc.fillColor(header ? NAVY : INK).text(c, x + pad, y + pad, { width: colW[i]! - pad * 2 });
        x += colW[i]!;
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(RULE).stroke();
      doc.x = left; doc.y = y + h;
    };
    if (s.stack) {
      // Each row as its own two-column list: the column name, then the value.
      const kw = [width * 0.4, width * 0.6];
      for (const r of s.rows) {
        if (doc.y + 40 > bottom()) doc.addPage();
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(r[0] ?? '', left, doc.y);
        doc.moveDown(0.2);
        for (let i = 1; i < s.columns.length; i++) {
          doc.font('Helvetica').fontSize(9);
          const cells = [s.columns[i]!, r[i] ?? ''];
          const h = Math.max(...cells.map((c, j) => doc.heightOfString(c || ' ', { width: kw[j]! - pad * 2 }))) + pad * 2;
          if (doc.y + h > bottom()) doc.addPage();
          const y = doc.y;
          doc.fillColor(MUTED).text(cells[0]!, left + pad, y + pad, { width: kw[0]! - pad * 2 });
          doc.fillColor(INK).text(cells[1]!, left + kw[0]! + pad, y + pad, { width: kw[1]! - pad * 2 });
          doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(RULE).stroke();
          doc.x = left; doc.y = y + h;
        }
        doc.moveDown(0.6);
      }
      continue;
    }
    row(s.columns, true);
    for (const r of s.rows) row(r, false);
    doc.moveDown(1);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 36;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`${o.title}`, left, y, { width: width / 2, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, { width: width / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

export type DownloadFormat = 'pdf' | 'xlsx';
export const formatOf = (v: string | null): DownloadFormat | undefined => (v === 'pdf' || v === 'xlsx' ? v : undefined);

/** The file to send back, PDF or Excel, with a name that says whose data and when. */
export async function dataFile(d: DataExport, format: DownloadFormat, o: { whose: 'your' | 'their'; title: string; fileBase: string }): Promise<Response> {
  const sheets = sheetsOf(d, o.whose);
  const bytes = format === 'pdf' ? await toPdf(sheets, { title: o.title, note: `Prepared ${formatDate(d.exportedAt)}. ${d.about.replace(/^Your data held by SAZO\.\s*/, '')}` }) : await toXlsx(sheets);
  const name = `${o.fileBase}-${d.exportedAt.slice(0, 10)}.${format}`;
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': format === 'pdf' ? 'application/pdf' : XLSX_TYPE,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  } });
}
