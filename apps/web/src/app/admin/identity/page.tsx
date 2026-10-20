import { formatDate } from '@sazo/contracts';
import { decideIdentity } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

interface Check {
  checkId: string; createdAt: string; idPhotoEvidenceId: string; nin: string;
  person: { name: string | null; phone: string | null; gender: string | null };
  businesses: { organisationId: string; name: string; type: string; status: string }[];
}

/**
 * A-05: National IDs of business managers. IDs sent while a business waits for approval are checked on the
 * Businesses page with the business; this queue is for managers added later and for every ID still waiting.
 */
export default async function IdentityChecks({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/identity');
  const sp = await searchParams;
  const data = await adminFetch<{ items: Check[] }>('/admin/identity-checks?status=pending');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">ID checks</h1>
      <p className="mb-4 max-w-2xl text-muted">Business managers&apos; National IDs. Check that the photo shows the same name and ID number, then approve or reject. The person gets an SMS with your reason. A business that is still waiting can also be approved from Businesses, which approves its managers&apos; IDs with it.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="checking National IDs" /> : data.items.length === 0 ? <p className="text-muted">No one is waiting.</p> : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.checkId} className="card p-4">
              <h2 className="font-display text-lg font-bold">{c.person.name ?? 'No name given'}</h2>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">National ID number</dt><dd className="sazo-id font-semibold">{c.nin}</dd>
                <dt className="text-muted">Phone</dt><dd>{c.person.phone ?? 'Not given'}</dd>
                <dt className="text-muted">Gender</dt><dd>{c.person.gender === 'female' ? 'Female' : c.person.gender === 'male' ? 'Male' : 'Not given'}</dd>
                <dt className="text-muted">Manager of</dt><dd>{c.businesses.length ? c.businesses.map((b) => b.name).join(', ') : 'No business yet'}</dd>
                <dt className="text-muted">Sent</dt><dd>{formatDate(c.createdAt)}</dd>
              </dl>
              <p className="mt-2"><a href={`/admin/files/${c.idPhotoEvidenceId}`} target="_blank" rel="noopener noreferrer" className="link text-sm">Open the ID photo</a></p>
              <form action={decideIdentity} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <input type="hidden" name="id" value={c.checkId} />
                <div><label htmlFor={`r-${c.checkId}`} className="label">Reason</label><input id={`r-${c.checkId}`} name="reason" required minLength={3} className="field" placeholder="ID number and photo match" /></div>
                <button name="decision" value="approve" className="btn btn-primary">Approve</button>
                <button name="decision" value="reject" className="btn btn-ghost">Reject</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
