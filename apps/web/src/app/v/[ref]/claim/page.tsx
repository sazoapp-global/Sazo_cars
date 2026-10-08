import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { VehicleHeader } from '@/components/vehicle-header';
import { api, isSignedIn } from '@/lib/api';
import type { Summary } from '@/lib/types';
import { Notice, type SP } from '../../../admin/notice';
import { sendLogbook } from '../../../my-cars/actions';

export const metadata: Metadata = { title: 'Show this is your car', robots: { index: false } };

export default async function Claim({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: SP }) {
  const { ref } = await params;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/v/${ref}/claim`);
  const sp = await searchParams;
  const summary = await api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined);
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} />}
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        <h1 className="font-display text-2xl font-bold">Show this is your car</h1>
        <p className="mt-1 text-muted">Your phone number is not the one on the registry record for this car, so SAZO needs to see the logbook.</p>
        <div className="mt-4"><Notice error={sp.error} /></div>
        <form action={sendLogbook} className="card space-y-4 p-5">
          <input type="hidden" name="ref" value={ref} />
          <div>
            <label htmlFor="logbook" className="label">Photo of the logbook page with the owner&apos;s name and the number plate</label>
            <input id="logbook" name="logbook" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" required className="field" />
            <p className="mt-1 text-sm text-muted">Take it in good light so the writing is readable. Only SAZO staff see it — never buyers.</p>
          </div>
          <button className="btn btn-primary w-full sm:w-auto"><Icon name="upload_file" />Send to SAZO</button>
        </form>
        <p className="mt-4 text-sm text-muted">SAZO checks the name matches your account and texts you, usually within 2 working days. <Link href={`/v/${ref}`} className="link">Back to the report</Link></p>
      </div>
    </>
  );
}
