// The kind of car and the other car details (D-148). One flat list of kinds, in the words most Ugandans use.
// Cars only for now (buses and trucks count as cars; no motorcycles or tuk-tuks).

export const VEHICLE_KINDS = ['saloon', 'hatchback', 'station_wagon', 'suv', 'pickup', 'van', 'minibus', 'bus', 'truck', 'coupe_convertible', 'other'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const KIND_LABELS: Record<VehicleKind, string> = {
  saloon: 'Saloon', hatchback: 'Hatchback', station_wagon: 'Station wagon', suv: 'SUV', pickup: 'Pickup', van: 'Van',
  minibus: 'Minibus (taxi)', bus: 'Bus', truck: 'Truck (lorry)', coupe_convertible: 'Coupe or convertible', other: 'Other',
};
export const kindLabel = (k: string | null | undefined) => (k && k in KIND_LABELS ? KIND_LABELS[k as VehicleKind] : undefined);
export const isVehicleKind = (v: unknown): v is VehicleKind => typeof v === 'string' && (VEHICLE_KINDS as readonly string[]).includes(v);

/** Kinds that carry loads, where load capacity, gross weight and axles matter most. */
export const LOAD_KINDS: readonly VehicleKind[] = ['pickup', 'van', 'truck', 'bus', 'minibus'];

export const DRIVES = ['2wd', '4wd', 'awd'] as const;
export type Drive = (typeof DRIVES)[number];
export const DRIVE_LABELS: Record<Drive, string> = { '2wd': '2WD', '4wd': '4WD', awd: 'AWD' };
export const STEERING_SIDES = ['right', 'left'] as const;
export type SteeringSide = (typeof STEERING_SIDES)[number];
export const STEERING_LABELS: Record<SteeringSide, string> = { right: 'Right hand', left: 'Left hand' };

/** Engine power: SAZO keeps horsepower and shows kilowatts beside it. */
export const hpToKw = (hp: number) => Math.round(hp * 0.7457);

/**
 * A kind from free text a registry or partner sent ("4x4" is an SUV). Order matters: "minibus" before "bus",
 * "station wagon" before "van". Undefined when nothing matches; the caller decides (Other, or ask).
 */
export function kindFromText(text: string | null | undefined): VehicleKind | undefined {
  const t = String(text ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!t) return undefined;
  if (isVehicleKind(t.replace(/ /g, '_'))) return t.replace(/ /g, '_') as VehicleKind;
  const rules: [RegExp, VehicleKind][] = [
    [/\b(mini ?bus|matatu|commuter|taxi|1[0-8] ?seater)\b/, 'minibus'],
    [/\b(bus|coach|coaster)\b/, 'bus'],
    [/\b(truck|lorry|tipper|prime mover|tractor head|trailer head|cargo)\b/, 'truck'],
    [/\b(pick ?up|double cab|single cab|d ?cab|s ?cab|ute)\b/, 'pickup'],
    [/\b(wagon|estate|touring|avant)\b/, 'station_wagon'],
    [/\b(suv|4x4|4wd|sport utility|jeep|crossover|off road)\b/, 'suv'],
    [/\b(mini ?van|van|panel|mpv|people carrier)\b/, 'van'],
    [/\b(hatch|hatchback)\b/, 'hatchback'],
    [/\b(saloon|sedan|limousine)\b/, 'saloon'],
    [/\b(coupe|convertible|cabriolet|cabrio|roadster|sports car)\b/, 'coupe_convertible'],
  ];
  return rules.find(([re]) => re.test(t))?.[1];
}

/**
 * The model code at the start of a Japanese chassis number ("ZRR80-0123456" → "ZRR80"). It names the model,
 * engine and drive, so it is the most exact way to tell the kind. Undefined for a 17-character VIN.
 */
export function chassisCode(chassis: string | null | undefined): string | undefined {
  const v = String(chassis ?? '').toUpperCase().replace(/\s+/g, '');
  if (!v || /^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return undefined;
  const m = /^([A-Z]{1,4}\d{1,3}[A-Z]{0,2})(?:-|\d{5,})/.exec(v);
  return m?.[1];
}

/** The optional details a dealer can give for one car (D-148); a missing one is taken from SAZO's model list. */
export interface CarSpecs {
  seats?: number; doors?: number; cylinders?: number; powerHp?: number; fuelKmPerL?: number;
  loadTonnes?: number; gvwTonnes?: number; axles?: number; drive?: Drive; steering?: SteeringSide;
}

/** The car details shown in "About this car", in order (D-148). */
export const CAR_DETAIL_KEYS = [
  'kind', 'engineCc', 'powerHp', 'cylinders', 'drive', 'fuelKmPerL', 'actualKmPerL',
  'seats', 'doors', 'steering', 'year', 'firstRegisteredYear', 'importedFrom', 'loadTonnes', 'gvwTonnes', 'axles',
] as const;
export type CarDetailKey = (typeof CAR_DETAIL_KEYS)[number];

/** Where a detail came from, in words for buyers. */
export type DetailSource = 'registry' | 'inspector' | 'garage' | 'dealer' | 'owner' | 'admin' | 'chassis_code' | 'model' | 'maker' | 'maker_test' | 'owners' | 'record';
export const DETAIL_SOURCE_LABELS: Record<DetailSource, string> = {
  registry: 'Registry', inspector: 'Inspector', garage: 'Garage', dealer: 'Dealer', owner: 'Owner', admin: 'Set by SAZO',
  chassis_code: 'Identified from the chassis code', model: 'Identified from the model', maker: "Maker's figure",
  maker_test: "Maker's figure (test data)", owners: 'Logged by owners', record: 'From the records',
};

export interface CarDetail {
  key: CarDetailKey;
  value: string | number;
  source: DetailSource;
  /** Extra words, e.g. "confirmed by an inspector" or "from 6 fill-ups". */
  note?: string;
}
