'use server';
import { api } from '@/lib/api';
import type { SearchResult, Summary } from '@/lib/types';

export interface PickedCar { ref: string; name: string; plate?: string }

/** Find one car by its number plate (or VIN / chassis number) for the compare pop-up. */
export async function findCarToCompare(query: string): Promise<{ car?: PickedCar; error?: string }> {
  const q = query.trim();
  if (q.length < 3) return { error: 'Enter the number plate, for example UBA 123A.' };
  try {
    const r = await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`);
    const match = r.matches.length === 1 ? r.matches[0] : undefined;
    if (!match) {
      return { error: r.outcome === 'multiple' ? 'More than one car has this plate. Enter its VIN or chassis number instead.' : `SAZO has no records for ${q.toUpperCase()}.` };
    }
    const s = await api<Summary>(`/vehicles/${match.vehicleRef}/summary`).catch(() => undefined);
    const v = s?.vehicle ?? match;
    return { car: { ref: match.vehicleRef, name: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', plate: v.currentPlate } };
  } catch {
    return { error: 'Could not look that up right now. Try again.' };
  }
}
