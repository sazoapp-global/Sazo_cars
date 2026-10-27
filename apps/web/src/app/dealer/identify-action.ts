'use server';
// What SAZO can tell from a chassis number or model (D-148): the kind of car and the model's figures, for the dealer's form.
import type { CarSpecs, Drive, VehicleKind } from '@sazo/contracts';
import { api } from '@/lib/api';

export interface Identified {
  kind?: VehicleKind; via?: 'chassis_code' | 'model'; code?: string; reason?: 'mixed_model' | 'unknown_model' | 'no_model'; kinds?: VehicleKind[];
  spec?: { make: string; model: string; engineCc: number | null; drive: Drive | null; basis: 'simulated' | 'maker' } & { [K in keyof CarSpecs]?: CarSpecs[K] | null };
}

export async function identifyCar(q: { make?: string; model?: string; chassis?: string }): Promise<Identified | null> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v && v.length <= 60) p.set(k, v);
  if (!p.has('model') && !p.has('chassis')) return null;
  return api<Identified>(`/reference/identify?${p}`, { auth: true }).catch(() => null);
}
