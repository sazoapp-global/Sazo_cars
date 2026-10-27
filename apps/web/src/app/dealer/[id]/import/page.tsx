import { formatUgx, kindLabel } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { AppFrame } from '@/components/app-frame/app-frame';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { ImportStage, Me, MyOrganisation } from '@/lib/types';
import { addCarsFromFile, checkCarsFile } from '../../actions';
import { stageLabel } from '../../labels';

export const metadata: Metadata = { title: 'Add many cars', robots: { index: false } };

interface Row {
  line: number; problems: string[];
  row: { make?: string; model?: string; modelYear?: number; kind?: string; chassisNumber?: string; vin?: string; plate?: string; askingPriceUgx?: number; stage: string; costs: unknown[] };
}
interface Checked {
  importId: string; fileName: string; status: 'checked' | 'adding' | 'added'; ready: number; withProblems: number; rows: Row[];
  results: { line: number; stockId?: string; error?: string; costsAdded?: number }[] | null;
}
type SP = Promise<{ file?: string; done?: string; error?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add many cars from an Excel or CSV file (D-131). Managers only: the file can carry import costs. */
export default async function ImportCars({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/import`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved') redirect(`/dealer/${id}`);
  if (org.role !== 'org_manager') redirect(`/dealer/${id}?error=${encodeURIComponent('Only a manager of this business can open that page.')}`);
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const [me, checked] = await Promise.all([
    api<Me>('/me', { auth: true }).catch(() => undefined),
    sp.file && UUID.test(sp.file) ? api<Checked>(`/dealer/imports/${sp.file}`, as).catch((err) => { if (err instanceof ApiError) return undefined; throw err; }) : Promise.resolve(undefined),
  ]);
  const name = (r: Row['row']) => [r.modelYear, r.make, r.model].filter(Boolean).join(' ') || r.vin || r.chassisNumber || r.plate || 'Car';
  const result = (line: number) => checked?.results?.find((r) => r.line === line);

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role }} business={{ name: org.tradingName ?? org.legalName, approved: true }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
      <div>
        <p><Link href={`/dealer/${id}`} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All cars</Link></p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl">Add many cars from a file</h1>
        <p className="mt-1 max-w-2xl text-muted">Put one car on each row of an Excel or CSV file, up to 200 cars a day. SAZO checks every row first and shows you what is ready. Nothing is added until you press Add.</p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {!checked && (
        <section className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="upload-h">
          <h2 id="upload-h" className="flex items-center gap-2 font-display text-lg font-bold"><Icon name="upload_file" />Your file</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li><a href={`/dealer/${id}/import/template.xlsx`} className="link">Download the Excel template</a>. Keep the first row with the column names.</li>
            <li>Fill in one car on each row. Make, model and asking price are enough to start. With the chassis number or number plate, the car joins SAZO at once, even if SAZO does not know it yet.</li>
            <li>Costs go in the cost columns, in one currency for the row, with the rate to UGX. Sales staff never see them.</li>
          </ol>
          <p className="mt-2 text-sm text-muted">Add photos and the mileage (with an odometer photo) on each car&apos;s page afterwards.</p>
          <form action={checkCarsFile} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="org" value={id} />
            <div><label htmlFor="file" className="label">Excel (.xlsx) or CSV file</label>
              <input id="file" name="file" type="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
            <button className="btn btn-primary"><Icon name="fact_check" />Check the file</button>
          </form>
        </section>
      )}

      {checked && (
        <section className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="rows-h">
          <h2 id="rows-h" className="flex items-center gap-2 font-display text-lg font-bold"><Icon name="fact_check" />{checked.fileName}</h2>
          <p className="mt-1 text-sm">
            {checked.status === 'added'
              ? `Done. ${checked.results?.filter((r) => r.stockId).length ?? 0} added, ${checked.withProblems + (checked.results?.filter((r) => r.error).length ?? 0)} not added.`
              : `${checked.ready} ready to add. ${checked.withProblems ? `${checked.withProblems} ${checked.withProblems === 1 ? 'needs' : 'need'} fixing first: correct ${checked.withProblems === 1 ? 'it' : 'them'} in your file and check it again, or add ${checked.withProblems === 1 ? 'it' : 'them one by one'} on the add-a-car form.` : ''}`}
          </p>
          {checked.status === 'checked' && checked.ready > 0 && (
            <form action={addCarsFromFile} className="mt-3">
              <input type="hidden" name="org" value={id} /><input type="hidden" name="file" value={checked.importId} />
              <button className="btn btn-primary"><Icon name="add" />Add {checked.ready === 1 ? 'the 1 ready car' : `the ${checked.ready} ready cars`}</button>
            </form>
          )}
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line" aria-label="Rows in the file">
            {checked.rows.map((l) => {
              const res = result(l.line);
              const ok = !l.problems.length && !res?.error;
              return (
                <li key={l.line} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                  <div>
                    <p className="font-semibold"><span className="text-muted">Row {l.line}.</span> {name(l.row)}</p>
                    <p className="text-muted">
                      {[kindLabel(l.row.kind) ?? null, l.row.askingPriceUgx ? formatUgx(l.row.askingPriceUgx, false) : null, stageLabel(l.row.stage as ImportStage), l.row.plate, l.row.vin ?? l.row.chassisNumber,
                        l.row.costs.length ? `${l.row.costs.length} ${l.row.costs.length === 1 ? 'cost' : 'costs'}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {l.problems.length > 0 && <ul className="mt-1 list-disc pl-5 text-bad-text">{l.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                    {res?.error && <p className="mt-1 text-bad-text">{res.error}</p>}
                  </div>
                  <div className="text-right">
                    {res?.stockId ? <Link href={`/dealer/${id}/car/${res.stockId}`} className="link font-semibold">Added: open</Link>
                      : <span className={`chip ${ok ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-bad-line bg-bad-fill text-bad-text'}`}>{ok ? 'Ready' : 'Needs fixing'}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3"><Link href={`/dealer/${id}/import`} className="link text-sm">Check another file</Link></p>
        </section>
      )}
    </AppFrame>
  );
}
