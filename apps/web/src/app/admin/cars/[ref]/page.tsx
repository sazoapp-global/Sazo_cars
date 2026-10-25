// A car's records inside the SAZO console (25 Oct 2026): what the public car page shows, beside the side bar,
// with a link back to the list it was opened from.
import type { Metadata } from 'next';
import { ReportHero, ReportSections } from '@/components/report/report-view';
import { api } from '@/lib/api';
import type { CarPhoto } from '@/lib/report-data';
import type { LedgerItem, TimelineItem } from '@/lib/types';
import { loadVehicle } from '../../../v/[ref]/load';
import { requireStaff } from '../../guard';
import { Back } from '../../rows';

export const metadata: Metadata = { title: 'Car records' };

export default async function ConsoleCar({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ back?: string }> }) {
  const { ref } = await params;
  await requireStaff(`/admin/cars/${ref}`);
  const { back } = await searchParams;
  const backTo = back && /^\/admin(\/|\?|$)/.test(back) ? back : '/admin';
  const data = await loadVehicle(ref);
  if (data.kind === 'summary') return <><Back href={backTo} label="Back" /><p className="text-muted">Only the public summary of this car is available.</p></>;
  const items = <T,>(p: Promise<{ items: T[] }>) => p.then((x) => x.items).catch(() => undefined);
  const [timeline, ledger, photos] = await Promise.all([
    items(api<{ items: TimelineItem[] }>(`/vehicles/${ref}/timeline`, { auth: true })),
    items(api<{ items: LedgerItem[] }>(`/vehicles/${ref}/evidence`, { auth: true })),
    items(api<{ items: CarPhoto[] }>(`/vehicles/${ref}/photos`, { auth: true })),
  ]);
  const x = { timeline, ledger, photos };
  return (
    <>
      <Back href={backTo} label="Back" />
      <div className="overflow-hidden rounded-[14px] border border-line">
        <ReportHero r={data.report} x={x} photoHref={(id) => `/v/${ref}/photo/${id}`} />
      </div>
      <ReportSections r={data.report} x={x} />
    </>
  );
}
