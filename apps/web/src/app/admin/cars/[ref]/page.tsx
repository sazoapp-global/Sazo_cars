// A car inside the SAZO console (25 Oct 2026; the full report since 28 Oct 2026): exactly what the car's public page
// shows, with its timeline and records, beside the side bar and across its width, with a link back to the list it
// was opened from.
import type { Metadata } from 'next';
import { EmbeddedReport, type EmbeddedReportParams } from '@/components/report/embedded-report';
import { requireStaff } from '../../guard';
import { Back } from '../../rows';

export const metadata: Metadata = { title: 'Car records' };

export default async function ConsoleCar({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<EmbeddedReportParams & { back?: string }> }) {
  const { ref } = await params;
  await requireStaff(`/admin/cars/${ref}`);
  const sp = await searchParams;
  const backTo = sp.back && /^\/admin(\/|\?|$)/.test(sp.back) ? sp.back : '/admin';
  const base = `/admin/cars/${ref}${backTo !== '/admin' ? `?${new URLSearchParams({ back: backTo })}` : ''}`;
  return (
    <>
      <Back href={backTo} label="Back" />
      <EmbeddedReport vehicleRef={ref} base={base} sp={sp} />
    </>
  );
}
