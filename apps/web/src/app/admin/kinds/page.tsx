// The kind of car (D-148), for SAZO admins: cars SAZO could not give a kind (by chassis code or model), and cars whose
// records name different kinds. Opening one shows the car and a form to set the kind; every choice keeps its reason.
import { KIND_LABELS, VEHICLE_KINDS, type VehicleKind } from '@sazo/contracts';
import { decideKind } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';
import { Back, Row, Rows, carHref, withQuery } from '../rows';

type Source = 'registry' | 'inspector' | 'garage' | 'dealer' | 'owner' | 'admin' | 'record' | string;
interface Car { vehicleRef: string; plate?: string; make?: string; model?: string; year?: number }
interface Queue {
  needed: (Car & { reason: 'mixed_model' | 'unknown_model' | 'no_model'; kinds?: VehicleKind[]; origin?: Source })[];
  disagree: (Car & { current?: VehicleKind; candidates: { kind: VehicleKind; source: Source; at: string }[] })[];
}

const SOURCE: Record<string, string> = { registry: 'Registry', inspector: 'Inspector', garage: 'Garage', dealer: 'Dealer', owner: 'Owner', admin: 'SAZO', record: 'A record' };
const ORIGIN: Record<string, string> = { registry: 'Registry record', inspector: 'Inspection', garage: 'Garage job on a car new to SAZO', dealer: 'Added by a dealer', owner: 'Added by its owner' };
const name = (c: Car) => [c.year, c.make, c.model].filter(Boolean).join(' ') || 'Car with no make or model';
const why = (c: Queue['needed'][number]) => c.reason === 'mixed_model' && c.kinds?.length ? `This model comes as ${c.kinds.map((k) => KIND_LABELS[k]).join(' or ')}`
  : c.reason === 'unknown_model' ? 'Model not on SAZO’s list' : 'No make or model on record';

export default async function Kinds({ searchParams }: { searchParams: Promise<Awaited<SP> & { tab?: string }> }) {
  const me = await requireStaff('/admin/kinds');
  const sp = await searchParams;
  if (!me.isAdmin) return (<><h1 className="font-display text-2xl font-bold">Kind of car</h1><Forbidden what="setting the kind of car" /></>);
  const data = await adminFetch<Queue>('/admin/vehicle-kinds');
  if (data === 'forbidden') return <Forbidden what="setting the kind of car" />;
  const PATH = '/admin/kinds';
  const tab = sp.tab === 'disagree' ? 'disagree' : 'needed';
  const Q = { tab: tab === 'disagree' ? 'disagree' : undefined, item: sp.item };

  const needed = data.needed.find((c) => c.vehicleRef === sp.item);
  const disagree = data.disagree.find((c) => c.vehicleRef === sp.item);
  const one = needed ?? disagree;
  if (one) {
    const suggested: VehicleKind[] = needed?.kinds ?? [...new Set(disagree?.candidates.map((c) => c.kind) ?? [])];
    const others = VEHICLE_KINDS.filter((k) => !suggested.includes(k));
    return (
      <>
        <Back href={withQuery(PATH, Q, { item: undefined })} label="All cars" />
        <Notice done={sp.done} error={sp.error} />
        <section className="card space-y-3 p-4" aria-label="Details">
          <h1 className="font-display text-xl font-bold">{name(one)}{one.plate ? <span className="font-normal text-muted"> · {one.plate}</span> : null}</h1>
          {needed && <p className="text-muted">{why(needed)}. {needed.origin ? ORIGIN[needed.origin] ?? '' : ''}</p>}
          {disagree && (
            <>
              <p className="text-muted">The records name different kinds. {disagree.current ? <>The report shows <strong>{KIND_LABELS[disagree.current]}</strong> until you decide.</> : null}</p>
              <ul className="text-sm">{disagree.candidates.map((c, i) => <li key={i}>{SOURCE[c.source] ?? c.source} says <strong>{KIND_LABELS[c.kind]}</strong></li>)}</ul>
            </>
          )}
          <p><a href={carHref(one.vehicleRef, withQuery(PATH, Q, {}))} className="link text-sm">Open the car&apos;s records</a></p>
          <form action={decideKind} className="space-y-3">
            <input type="hidden" name="ref" value={one.vehicleRef} />
            <input type="hidden" name="back" value={withQuery(PATH, Q, { item: undefined })} />
            <div><label htmlFor="kind" className="label">Kind of car</label>
              <select id="kind" name="kind" required className="field" defaultValue={disagree?.current ?? ''}>
                <option value="">Choose</option>
                {suggested.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                {suggested.length > 0 && <option disabled>──────────</option>}
                {others.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select></div>
            <div><label htmlFor="reason" className="label">Reason</label>
              <input id="reason" name="reason" required minLength={3} maxLength={300} className="field" placeholder="e.g. Logbook says double cab pickup" /></div>
            <button className="btn btn-primary">Set the kind</button>
          </form>
        </section>
      </>
    );
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Kind of car</h1>
      <p className="max-w-3xl text-muted">Cars SAZO could not identify by their chassis code or model, and cars whose records disagree. Choose the kind; your choice and reason are recorded.</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Lists" className="flex flex-wrap gap-2">
        <a href={PATH} aria-current={tab === 'needed' ? 'page' : undefined} className={chip(tab === 'needed')}>Kind needed {data.needed.length}</a>
        <a href={`${PATH}?tab=disagree`} aria-current={tab === 'disagree' ? 'page' : undefined} className={chip(tab === 'disagree')}>Records disagree {data.disagree.length}</a>
      </nav>
      {tab === 'needed' ? (
        data.needed.length === 0 ? <p className="text-muted">Every car has a kind.</p> : (
          <Rows label="Kind needed">
            {data.needed.map((c) => <Row key={c.vehicleRef} href={withQuery(PATH, Q, { item: c.vehicleRef })} title={<>{name(c)}{c.plate ? <span className="font-normal text-muted"> · {c.plate}</span> : null}</>}
              meta={[why(c), c.origin ? ORIGIN[c.origin] : undefined].filter(Boolean).join(' · ')} status="Set the kind" tone="warn" />)}
          </Rows>
        )
      ) : (
        data.disagree.length === 0 ? <p className="text-muted">No disagreements.</p> : (
          <Rows label="Records disagree">
            {data.disagree.map((c) => <Row key={c.vehicleRef} href={withQuery(PATH, Q, { item: c.vehicleRef })} title={<>{name(c)}{c.plate ? <span className="font-normal text-muted"> · {c.plate}</span> : null}</>}
              meta={[...new Set(c.candidates.map((x) => `${SOURCE[x.source] ?? x.source}: ${KIND_LABELS[x.kind]}`))].join(' · ')} status="Decide" tone="warn" />)}
          </Rows>
        )
      )}
    </>
  );
}
