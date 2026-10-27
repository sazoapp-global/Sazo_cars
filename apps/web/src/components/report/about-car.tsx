// "About this car" (D-148): the kind of car and the other details, each with where it came from. Figures from SAZO's
// model list are the maker's figures for the model (marked test data until real maker specifications are loaded),
// not measurements of this car; actual fuel use comes from owners' fill-ups.
import {
  CAR_DETAIL_KEYS, DETAIL_SOURCE_LABELS, DRIVE_LABELS, LOAD_KINDS, STEERING_LABELS, hpToKw, kindLabel,
  type CarDetail, type CarDetailKey, type Drive, type SteeringSide, type VehicleKind,
} from '@sazo/contracts';

export const DETAIL_LABELS: Record<CarDetailKey, string> = {
  kind: 'Kind of car', engineCc: 'Engine size', powerHp: 'Engine power', cylinders: 'Cylinders', drive: 'Drive', fuelKmPerL: 'Fuel consumption',
  actualKmPerL: 'Actual fuel use', seats: 'Seats', doors: 'Doors', steering: 'Steering side', year: 'Year of manufacture',
  firstRegisteredYear: 'First registered in Uganda', importedFrom: 'Imported from', loadTonnes: 'Load capacity', gvwTonnes: 'Gross vehicle weight', axles: 'Number of axles',
};

/** A detail's value in words. */
export function detailValue(key: CarDetailKey, v: string | number): string {
  const n = Number(v);
  switch (key) {
    case 'kind': return kindLabel(String(v)) ?? String(v);
    case 'engineCc': return `${n.toLocaleString('en-GB')} cc`;
    case 'powerHp': return `${n} hp (${hpToKw(n)} kW)`;
    case 'drive': return DRIVE_LABELS[v as Drive] ?? String(v);
    case 'steering': return STEERING_LABELS[v as SteeringSide] ?? String(v);
    case 'fuelKmPerL': case 'actualKmPerL': return `${n.toLocaleString('en-GB', { maximumFractionDigits: 1 })} km per litre`;
    case 'loadTonnes': case 'gvwTonnes': return `${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${n === 1 ? 'tonne' : 'tonnes'}`;
    default: return String(v);
  }
}

const LOAD_KEYS: CarDetailKey[] = ['loadTonnes', 'gvwTonnes', 'axles'];
const half = Math.ceil(CAR_DETAIL_KEYS.length / 2);

export function AboutCar({ details }: { details: CarDetail[] }) {
  const byKey = new Map(details.map((d) => [d.key, d]));
  const kind = byKey.get('kind')?.value as VehicleKind | undefined;
  const loadKind = !!kind && LOAD_KINDS.includes(kind);
  const noLoad = LOAD_KEYS.every((k) => !byKey.has(k));
  const keys = CAR_DETAIL_KEYS.filter((k) => !(LOAD_KEYS.includes(k) && noLoad));
  const testData = details.some((d) => d.source === 'maker_test');
  const row = (key: CarDetailKey) => {
    const d = byKey.get(key);
    return (
      <div key={key} className="flex justify-between gap-4 border-b border-line py-2.5">
        <dt className="text-muted">{DETAIL_LABELS[key]}</dt>
        <dd className="text-right">
          {d ? <span className="font-semibold">{detailValue(key, d.value)}</span>
            : <span className="text-muted">{key === 'actualKmPerL' ? 'Not enough fill-ups yet' : 'Not recorded'}</span>}
          {d && <span className="block text-xs text-muted">{DETAIL_SOURCE_LABELS[d.source]}{d.note ? `, ${d.note}` : ''}</span>}
        </dd>
      </div>
    );
  };
  const left = keys.slice(0, half), right = keys.slice(half);
  return (
    <section aria-labelledby="about-car" className="card mt-6 p-5 md:p-7">
      <h2 id="about-car" className="font-display text-xl font-extrabold text-primary-container md:text-2xl">About this car</h2>
      <p className="mt-1 text-sm text-muted">
        A &ldquo;maker&apos;s figure&rdquo; is published for this model and engine, not measured on this car.
        {testData && ' Marked test data: SAZO has not yet loaded the makers’ own specifications.'}
      </p>
      <div className="mt-3 grid gap-x-10 md:grid-cols-2">
        <dl>{left.map(row)}</dl>
        <dl>
          {right.map(row)}
          {noLoad && (
            <div className="flex justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-muted">Load capacity, gross weight, axles</dt>
              <dd className="text-right text-muted">{loadKind || !kind ? 'Not recorded' : 'Not given for this kind'}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
