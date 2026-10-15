import { requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

/**
 * A person's data as a JSON file: SAZO administrators only, for example to answer a formal data request.
 * People read their own data on the website and save it as PDF. Every download is written to the audit log.
 */
export default async function PeopleData({ searchParams }: { searchParams: SP }) {
  const me = await requireStaff('/admin/people');
  const sp = await searchParams;
  if (!me.isAdmin) return (<><h1 className="font-display text-2xl font-bold">People&apos;s data</h1><Forbidden what="downloading people's data" /></>);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">People&apos;s data</h1>
      <p className="mb-4 max-w-2xl text-muted">Download everything SAZO holds about one person as a JSON file, for example to answer a formal request for their data. Only administrators can do this, and each download is recorded in the audit log.</p>
      <Notice error={sp.error} />
      <form action="/admin/people/export" method="get" className="card max-w-lg space-y-3 p-4">
        <div><label htmlFor="phone" className="label">Their mobile number</label>
          <input id="phone" name="phone" className="field" inputMode="tel" autoComplete="off" placeholder="0772 123 456" required /></div>
        <button className="btn btn-primary">Download JSON file</button>
      </form>
    </>
  );
}
