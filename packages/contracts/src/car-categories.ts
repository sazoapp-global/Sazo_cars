// A dealer's car category (5 Nov 2026, D-163): new from the factory, used abroad and imported, or used in Uganda.
// Buyers see it on the car's page; the dealer's lists have a tab for each.
export const CAR_CATEGORIES = ['new', 'foreign_used', 'ug_used'] as const;
export type CarCategory = (typeof CAR_CATEGORIES)[number];

export const CAR_CATEGORY_LABELS: Record<CarCategory, string> = { new: 'New', foreign_used: 'Imported used', ug_used: 'Ugandan used' };
export const CAR_CATEGORY_HINTS: Record<CarCategory, string> = {
  new: 'Straight from the factory, never registered.',
  foreign_used: 'Used abroad, brought into Uganda. Mileage on arrival needed.',
  ug_used: 'Already used and registered in Uganda. Mileage now needed.',
};
/** Used cars need their mileage when they are added (with the plate or chassis number and an odometer photo). */
export const categoryNeedsMileage = (c: CarCategory | null | undefined) => c === 'foreign_used' || c === 'ug_used';
export const isCarCategory = (v: unknown): v is CarCategory => typeof v === 'string' && (CAR_CATEGORIES as readonly string[]).includes(v);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const WORDS: Record<string, CarCategory> = {
  new: 'new', brandnew: 'new', factory: 'new', fromfactory: 'new', directfromfactory: 'new',
  importedused: 'foreign_used', foreignused: 'foreign_used', imported: 'foreign_used', usedimported: 'foreign_used', importused: 'foreign_used',
  ugandanused: 'ug_used', ugandaused: 'ug_used', localused: 'ug_used', locallyused: 'ug_used', ugused: 'ug_used', usedlocally: 'ug_used', usedinuganda: 'ug_used',
};
/** A category from what a dealer wrote ("Imported used", "foreign used", "Ugandan used"). */
export const categoryFromText = (s: string): CarCategory | undefined => WORDS[squash(s)];
