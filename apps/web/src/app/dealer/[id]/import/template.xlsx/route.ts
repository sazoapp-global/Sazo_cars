import { DEALER_IMPORT_COLUMNS } from '@sazo/contracts';
import writeXlsxFile from 'write-excel-file/node';
import { isSignedIn } from '@/lib/api';

/** The Excel template for adding many cars at once (D-131): the column names and one example car. */
export async function GET() {
  if (!(await isSignedIn())) return new Response('Sign in first', { status: 401 });
  const header = DEALER_IMPORT_COLUMNS.map((c) => ({ value: c.label, fontWeight: 'bold' as const, backgroundColor: '#E6ECFA' }));
  const example = DEALER_IMPORT_COLUMNS.map((c) => ({ value: c.example }));
  const buffer = await writeXlsxFile([header, example], {
    sheet: 'Cars', stickyRowsCount: 1,
    columns: DEALER_IMPORT_COLUMNS.map((c) => ({ width: Math.max(14, Math.min(34, c.label.length + 4)) })),
  }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="sazo-cars-template.xlsx"',
  } });
}
