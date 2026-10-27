import { useEffect, useId, useState } from 'react';
import { getPhoto, savePhoto, type LocalPhoto } from '../lib/db';
import { quickCheck, sha256, shrink } from '../lib/photos';
import { uuidv7 } from '../lib/uuid';
import { Icon } from './icon';

// Photos are sent as JPEG (shrink turns every picture into one) or PNG only (D-147).
const ACCEPTED = ['image/jpeg', 'image/png'];

/** Take a photo with the back camera. It is shrunk, fingerprinted and kept on the phone until there's signal. */
export function PhotoButton({ jobId, kind, photoId, label, hint, required, onChange }: {
  jobId: string;
  kind: LocalPhoto['kind'];
  photoId?: string;
  label: string;
  hint?: string;
  required?: boolean;
  onChange: (photoId: string | undefined) => void;
}) {
  const inputId = useId();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let revoke: string | undefined;
    void (async () => {
      const p = photoId ? await getPhoto(photoId) : undefined;
      if (p) { revoke = URL.createObjectURL(p.blob); setUrl(revoke); } else setUrl(undefined);
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [photoId]);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(undefined); setWarning(undefined);
    try {
      const blob = await shrink(file);
      if (!ACCEPTED.includes(blob.type)) throw new Error('unsupported');
      const problem = await quickCheck(blob);
      if (problem) setWarning(`This photo looks ${problem === 'too_dark' ? 'too dark' : 'too small'} to read. Please retake it. If you keep it, a SAZO reviewer will check it and the record counts for less until then.`);
      const id = uuidv7();
      await savePhoto({ id, jobId, kind, blob, mime: blob.type, size: blob.size, sha256: await sha256(blob), capturedAt: new Date().toISOString() });
      onChange(id);
    } catch {
      setError('That photo could not be used. Take it again with the camera.');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p className="label">{label}{required && <span className="text-bad-text"> *</span>}</p>
      {hint && <p className="-mt-1 mb-2 text-sm text-muted">{hint}</p>}
      <div className="flex items-center gap-3">
        {url ? <img src={url} alt={`${label}, photo taken`} className="h-20 w-20 rounded-lg border border-line object-cover" /> : (
          <span className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-label"><Icon name="add_a_photo" size={28} /></span>
        )}
        <label htmlFor={inputId} className={`btn ${url ? 'btn-ghost' : 'btn-primary'} flex-1 cursor-pointer`}>
          <Icon name="add_a_photo" />{busy ? 'Saving photo…' : url ? 'Retake' : 'Take photo'}
        </label>
        <input id={inputId} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
        {url && <button type="button" aria-label={`Remove ${label} photo`} className="btn btn-ghost !px-3" onClick={() => { setWarning(undefined); onChange(undefined); }}><Icon name="delete" /></button>}
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-bad-text">{error}</p>}
      {warning && url && <p role="alert" className="mt-1 flex items-start gap-1 text-sm font-semibold text-warn-text"><Icon name="warning" size={16} className="mt-0.5 shrink-0" />{warning}</p>}
    </div>
  );
}
