import { requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

/**
 * A person's data as a PDF or Excel file (D-147): SAZO administrators only, for example to answer a formal data
 * request. People download their own from Your account. Every download is written to the audit log.
 */
export default async function PeopleData({ searchParams }: { searchParams: SP }) {
  const me = await requireStaff('/admin/people');
  const sp = await searchParams;
  if (!me.isAdmin) return (<><h1 className="font-display text-2xl font-bold">People&apos;s data</h1><Forbidden what="downloading people's data" /></>);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">People&apos;s data</h1>
      <p className="mb-4 max-w-2xl text-muted">Download everything SAZO holds about one person as a PDF or an Excel file, for example to answer a formal request for their data. Only administrators can do this, and each download is recorded in the audit log.</p>
      <Notice error={sp.error} />
      <form action="/admin/people/export" method="get" className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div><label htmlFor="phone" className="label">Their mobile number</label>
          <input id="phone" name="phone" className="field" inputMode="tel" autoComplete="off" placeholder="0772 123 456" required /></div>
        <div className="flex flex-wrap gap-2">
          <button name="format" value="pdf" className="btn btn-primary">Download PDF</button>
          <button name="format" value="xlsx" className="btn btn-ghost">Download Excel</button>
        </div>
        <p className="text-sm text-muted md:col-span-2">Excel has one sheet for each part: details, businesses, saved cars, shared reports, cars owned, reviews, devices.</p>
      </form>
    </>
  );
}
