// A car's full SAZO report inside the partner workspace (28 Oct 2026): SAZO staff see it beside the console's side
// bar, partners' own operators on their portal page; nobody is sent to the buyers' page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icon';
import { EmbeddedReport, type EmbeddedReportParams } from '@/components/report/embedded-report';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { loadSource } from '../../load';

export const metadata: Metadata = { title: 'Car report', robots: { index: false } };
const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export default async function PartnerCar({ params, searchParams }: { params: Promise<{ code: string; ref: string }>; searchParams: Promise<EmbeddedReportParams> }) {
  const { code, ref } = await params;
  if (!REF.test(ref)) notFound();
  const source = await loadSource(code, `/partner/${code}/cars/${ref}`);
  // SAZO staff are inside the console frame, which gives the page its space; partners' plain page needs its own.
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  const framed = !!me?.platformRoles.some((r) => r === 'sazo_admin' || r === 'sazo_reviewer');
  return (
    <div className={`space-y-4 ${framed ? '' : 'px-4 py-6 md:px-8'}`}>
      <p><Link href={`/partner/${code}?tab=recent`} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />{source.name}: sent recently</Link></p>
      <EmbeddedReport vehicleRef={ref} base={`/partner/${code}/cars/${ref}`} sp={await searchParams} />
    </div>
  );
}
