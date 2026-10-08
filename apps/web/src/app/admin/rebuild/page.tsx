import { startRebuild } from '../actions';
import { requireStaff } from '../guard';
import { Notice, type SP } from '../notice';

export default async function Rebuild({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/rebuild');
  const sp = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Recalculate</h1>
      <p className="mb-4 text-muted">Runs the trust rules again and stores a new result. Older results are kept for the audit trail. Normally this happens by itself whenever records change.</p>
      <Notice done={sp.done} error={sp.error} />
      <form action={startRebuild} className="card max-w-lg space-y-3 p-4">
        <div><label htmlFor="vehicleRef" className="label">One vehicle (leave empty for every vehicle)</label>
          <input id="vehicleRef" name="vehicleRef" className="field sazo-id" placeholder="SZV-XXXX-XXXX" /></div>
        <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" className="h-5 w-5" />I understand this may take a while for every vehicle</label>
        <button className="btn btn-primary">Recalculate</button>
      </form>
    </>
  );
}
