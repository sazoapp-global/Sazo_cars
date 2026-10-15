// Icons and one-line explanations for the seven buyer questions (shared by the home page and the report).
import type { IconName } from '@/components/icon';

export const QUESTION_ICONS: Record<string, IconName> = {
  identity: 'fact_check', care: 'handyman', damage: 'minor_crash', mileage: 'speed', provenance: 'flight_land', legal_financial: 'account_balance', valuation: 'sell',
};
export const QUESTION_BLURBS: Record<string, string> = {
  identity: 'Check the chassis, engine and plate against the records, and against the car in front of you.',
  care: 'See service visits recorded by approved garages, with the mileage at each one.',
  damage: 'Accidents, insurance claims, structural repairs and paint work on record.',
  mileage: 'Every odometer reading in order, so a wound-back clock stands out.',
  provenance: 'Where it was imported from, how many owners, and how it was used.',
  legal_financial: 'Stolen reports, active loans and other legal holds, as status only.',
  valuation: 'A price range from comparable sales, adjusted for this car’s history.',
};
