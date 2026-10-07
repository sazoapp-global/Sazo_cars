import { factValue } from '@sazo/contracts';
import Link from 'next/link';
import type { VehicleCard } from '@/lib/types';
import { Plate } from './plate';
import { Banner, vehicleName } from './vehicle-card';

export function VehicleHeader({ v, asOf, tab }: { v: VehicleCard; asOf: string; tab?: 'report' | 'timeline' | 'evidence' }) {
  const tabs = [
    { id: 'report', href: `/v/${v.vehicleRef}`, label: 'Report' },
    { id: 'timeline', href: `/v/${v.vehicleRef}/timeline`, label: 'Timeline' },
    { id: 'evidence', href: `/v/${v.vehicleRef}/evidence`, label: 'Evidence' },
  ] as const;
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto max-w-5xl px-4 pt-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {v.currentPlate && <Plate value={v.currentPlate} />}
          {v.status === 'provisional' && <span className="chip border-na-line bg-na-fill text-na-text">Not yet confirmed by an official record</span>}
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold md:text-3xl">{vehicleName(v)}</h1>
        <p className="text-sm text-muted">SAZO reference <span className="sazo-id">{v.vehicleRef}</span> · Records as of {factValue('first_registration_date', asOf.slice(0, 10))}</p>
        {v.banner && <div className="mt-3"><Banner banner={v.banner} /></div>}
        {tab && (
          <nav aria-label="Vehicle sections" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link key={t.id} href={t.href} aria-current={tab === t.id ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.id ? 'border-primary-container text-primary-container' : 'border-transparent text-muted hover:text-primary-container'}`}>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        {!tab && <div className="h-4" />}
      </div>
    </div>
  );
}
