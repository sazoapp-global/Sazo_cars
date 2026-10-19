import { formatDate } from '@sazo/contracts';
import { adminFetch, requireStaff } from '../guard';
import { decideBroker } from '../actions';
import { Forbidden, Notice, type SP } from '../notice';

interface Application {
  applicationId: string; status: string; decisionReason: string | null; createdAt: string; idPhotoEvidenceId: string; nin: string;
  person: { name: string | null; phone: string | null; gender: string | null };
}

/** Broker identity check (D-127): compare the ID number and the photo with the person's details, then approve or reject with a reason. */
export default async function Brokers({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/brokers');
  const sp = await searchParams;
  const data = await adminFetch<{ items: Application[] }>('/admin/brokers/applications?status=pending');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Brokers</h1>
      <p className="mb-4 max-w-2xl text-muted">People who want to share dealers&apos; cars as brokers. Check that the ID photo shows the same name and ID number, then approve or reject. The person sees your reason.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="checking brokers" /> : data.items.length === 0 ? <p className="text-muted">No one is waiting.</p> : (
        <ul className="space-y-3">
          {data.items.map((a) => (
            <li key={a.applicationId} className="card p-4">
              <h2 className="font-display text-lg font-bold">{a.person.name ?? 'No name given'}</h2>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">National ID number</dt><dd className="sazo-id font-semibold">{a.nin}</dd>
                <dt className="text-muted">Phone</dt><dd>{a.person.phone ?? 'Not given'}</dd>
                <dt className="text-muted">Gender</dt><dd>{a.person.gender === 'female' ? 'Female' : a.person.gender === 'male' ? 'Male' : 'Not given'}</dd>
                <dt className="text-muted">Applied</dt><dd>{formatDate(a.createdAt)}</dd>
              </dl>
              <p className="mt-2"><a href={`/admin/files/${a.idPhotoEvidenceId}`} target="_blank" rel="noopener noreferrer" className="link text-sm">Open the ID photo</a></p>
              <form action={decideBroker} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <input type="hidden" name="id" value={a.applicationId} />
                <div><label htmlFor={`r-${a.applicationId}`} className="label">Reason</label><input id={`r-${a.applicationId}`} name="reason" required minLength={3} className="field" placeholder="ID number and photo match" /></div>
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
