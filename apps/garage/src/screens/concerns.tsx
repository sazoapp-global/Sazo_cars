// Report a problem with a car (O-002): signs of fraud seen in the bay or at an inspection. SAZO staff check
// every report; while a serious one is being checked, buyers see a neutral "being checked" notice on the car.
import { CONCERNS, CONCERN_CATEGORIES, formatDate, type ConcernCategory } from '@sazo/contracts';
import { useCallback, useEffect, useState } from 'react';
import { PlateText } from '../components/bits';
import { Icon } from '../components/icon';
import { PhotoButton } from '../components/photo-button';
import { ApiError, OfflineError, request } from '../lib/api';
import { forgetJob } from '../lib/db';
import { go, useOnline } from '../lib/route';
import { uploadPhoto } from '../lib/sync';
import type { Garage } from '../lib/types';
import { uuidv7 } from '../lib/uuid';

interface Concern { concernId: string; plate: string; category: ConcernCategory; description: string; status: 'open' | 'upheld' | 'dismissed'; decisionReason: string | null; createdAt: string }
const STATUS = {
  open: { text: 'SAZO is checking', cls: 'text-warn-text bg-warn-fill border-warn-line' },
  upheld: { text: 'Confirmed by SAZO', cls: 'text-bad-text bg-bad-fill border-bad-line' },
  dismissed: { text: 'Not confirmed', cls: 'text-na-text bg-na-fill border-na-line' },
} as const;

export function Concerns({ workplace }: { workplace: Garage }) {
  const online = useOnline();
  const [draftId] = useState(() => uuidv7());
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<ConcernCategory>();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [list, setList] = useState<Concern[]>();

  const load = useCallback(async () => {
    try { setList((await request<{ items: Concern[] }>('/concerns', { org: workplace.id })).items); } catch (err) {
      if (err instanceof OfflineError) setList([]); else throw err;
    }
  }, [workplace.id]);
  useEffect(() => { void load(); }, [load]);

  const ready = plate.replace(/\s/g, '').length >= 4 && !!category && text.trim().length >= 10;
  async function send() {
    setBusy(true); setError(undefined);
    try {
      const evidenceIds = await Promise.all(photos.filter((p): p is string => !!p).map((p) => uploadPhoto(p)));
      await request('/concerns', { method: 'POST', org: workplace.id, body: { plate: plate.trim().toUpperCase(), category, description: text.trim(), evidenceIds } });
      await forgetJob(draftId); // the photos are with SAZO now
      setSent(true); setPlate(''); setCategory(undefined); setText(''); setPhotos([undefined, undefined, undefined]);
      await load();
    } catch (err) {
      setError(err instanceof OfflineError ? 'No signal. Send this when you have signal.' : err instanceof ApiError ? (err.detail ?? 'SAZO could not accept this report.') : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 p-4 pb-10">
      <button type="button" className="flex items-center gap-1 font-semibold text-primary-container" onClick={() => go({ name: 'home' })}><Icon name="arrow_back" size={18} />Home</button>
      <h1 className="font-display text-2xl font-bold">Report a problem with a car</h1>
      <p className="-mt-3 text-muted">Seen signs of fraud? Tell SAZO. A SAZO reviewer checks every report before buyers see anything. Your name is never shown to buyers.</p>
      {sent && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Thank you. SAZO will check it — you can follow it below.</p>}

      <div><label htmlFor="cplate" className="label">Number plate *</label>
        <input id="cplate" className="field sazo-id !text-lg font-bold" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="UBK 482M"
          value={plate} onChange={(e) => { setPlate(e.target.value); setSent(false); }} /></div>
      <fieldset>
        <legend className="label">What is wrong? *</legend>
        <div className="space-y-2">
          {CONCERN_CATEGORIES.map((c) => (
            <label key={c} className="flex cursor-pointer gap-3 rounded-lg border-2 border-line bg-white p-3 has-[:checked]:border-primary-container has-[:checked]:bg-soft">
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="mt-1 h-5 w-5 shrink-0" />
              <span><span className="block font-semibold">{CONCERNS[c].label}</span><span className="text-sm text-muted">{CONCERNS[c].hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div><label htmlFor="cdesc" className="label">What did you see? *</label>
        <textarea id="cdesc" rows={4} maxLength={2000} className="field !min-h-28 py-3" value={text} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-sm text-muted">Facts only: what you saw, where, when. At least 10 characters.</p></div>
      {photos.map((p, i) => (i > 0 && !photos[i - 1] ? null : (
        <PhotoButton key={i} jobId={draftId} kind="vehicle_photo" photoId={p} label={i === 0 ? 'Photo (optional)' : 'Another photo (optional)'}
          onChange={(id) => setPhotos((x) => x.map((y, k) => (k === i ? id : y)))} />
      )))}
      {error && <p role="alert" className="font-semibold text-bad-text">{error}</p>}
      <button type="button" className="btn btn-focal w-full" disabled={!ready || busy || !online} onClick={() => void send()}>
        <Icon name="cloud_upload" />{busy ? 'Sending…' : online ? 'Send to SAZO' : 'Needs signal'}
      </button>

      <section aria-labelledby="raised">
        <h2 id="raised" className="font-display text-lg font-bold">Reports from {workplace.name}</h2>
        {list === undefined ? <div className="skeleton mt-2 h-16" /> : list.length === 0 ? <p className="mt-2 text-muted">None yet.</p> : (
          <ul className="mt-2 space-y-2">
            {list.map((c) => (
              <li key={c.concernId} className="card p-4">
                <div className="flex items-center justify-between gap-2"><PlateText value={c.plate} /><span className="text-xs text-label">{formatDate(c.createdAt)}</span></div>
                <p className="mt-1 font-semibold">{CONCERNS[c.category].label}</p>
                <span className={`chip mt-2 ${STATUS[c.status].cls}`}>{STATUS[c.status].text}</span>
                {c.decisionReason && <p className="mt-2 text-sm text-muted">SAZO: {c.decisionReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
