'use client';
// The car's category on Add a car (5 Nov 2026, D-163), asked first: New, Imported used or Ugandan used. A used car
// needs its mileage (on arrival for an imported car, now for a Ugandan one) with a photo of the odometer, once
// its plate or chassis number is given; for a new car the mileage can be left out.
import { CAR_CATEGORIES, CAR_CATEGORY_HINTS, CAR_CATEGORY_LABELS, type CarCategory, categoryNeedsMileage } from '@sazo/contracts';
import { useState } from 'react';
import { PICTURE_ACCEPT } from '@/lib/upload-types';

const FILE = 'block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary';

export function CategoryField({ defaultValue }: { defaultValue?: CarCategory }) {
  const [cat, setCat] = useState<CarCategory | undefined>(defaultValue);
  const mileage = (label: string, note: string) => (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="mileage" className="label">{label}</label><input id="mileage" name="mileage" inputMode="numeric" className="field tabular-nums" placeholder="Shown on the dashboard" /></div>
      <div><label htmlFor="odometer" className="label">Odometer photo</label><input id="odometer" name="odometer" type="file" accept={PICTURE_ACCEPT} capture="environment" className={FILE} /></div>
      <p className="text-sm text-muted sm:col-span-2">{note}</p>
    </div>
  );
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">Category *</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {CAR_CATEGORIES.map((c) => (
          <label key={c} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${cat === c ? 'border-primary-container bg-soft' : 'border-line hover:bg-soft'}`}>
            <input type="radio" name="category" value={c} required checked={cat === c} onChange={() => setCat(c)} className="mt-1 accent-[var(--color-primary-container)]" />
            <span><b className="block">{CAR_CATEGORY_LABELS[c]}</b><span className="text-sm text-muted">{CAR_CATEGORY_HINTS[c]}</span></span>
          </label>
        ))}
      </div>
      {categoryNeedsMileage(cat) && mileage(cat === 'foreign_used' ? 'Mileage on arrival (km) *' : 'Mileage now (km) *',
        'Needed with the number plate or chassis number. Without them yet, add the mileage when you add them.')}
      {cat === 'new' && (
        <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-primary">Add the mileage (optional, needs the plate or chassis number and an odometer photo)</summary>
          {mileage('Mileage now (km)', 'A new car usually shows only delivery kilometres.')}
        </details>
      )}
    </fieldset>
  );
}
