import { headline } from '@sazo/contracts';
import Link from 'next/link';
import type { VehicleCard } from '@/lib/types';
import { Icon } from './icon';
import { Plate } from './plate';

const MATCHED: Record<VehicleCard['matchedOn'], string> = {
  vin: 'Matched on VIN', chassis_number: 'Matched on chassis number', registration_plate: 'Matched on number plate', previous_plate: 'This was a previous plate of this car',
};

export function vehicleName(v: Pick<VehicleCard, 'make' | 'model' | 'year'>): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

export function Banner({ banner }: { banner: NonNullable<VehicleCard['banner']> }) {
  const serious = banner.severity === 'serious';
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${serious ? 'border-bad-line bg-bad-fill text-bad-text' : 'border-warn-line bg-warn-fill text-warn-text'}`}>
      <Icon name={serious ? 'report' : 'info'} size={18} className="mt-0.5 shrink-0" />
      <span>{headline(banner.headlineKey)}</span>
    </div>
  );
}

export function VehicleResult({ v }: { v: VehicleCard }) {
  return (
    <Link href={`/v/${v.vehicleRef}`} className="card block p-4 transition hover:border-line-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {v.currentPlate && <Plate value={v.currentPlate} size="sm" />}
          <h2 className="mt-1.5 font-display text-lg font-bold">{vehicleName(v)}</h2>
          <p className="text-sm text-muted">{MATCHED[v.matchedOn]}{v.status === 'provisional' ? ' · Not yet confirmed by an official record' : ''}</p>
        </div>
        <Icon name="chevron_forward" className="mt-1 shrink-0 text-label" />
      </div>
      {v.banner && <div className="mt-3"><Banner banner={v.banner} /></div>}
    </Link>
  );
}
