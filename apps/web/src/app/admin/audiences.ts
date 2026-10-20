/** Who an announcement or a help answer is for (A-06, A-07), in plain words. */
export const AUDIENCES: [string, string][] = [
  ['everyone', 'Everyone'], ['buyers', 'Buyers'], ['garages', 'Garages'], ['dealers', 'Dealers'], ['inspectors', 'Inspectors'],
  ['partners', 'Data partners'], ['brokers', 'Brokers'], ['staff', 'SAZO staff'],
];
export const audienceLabel = (a: string) => AUDIENCES.find(([k]) => k === a)?.[1] ?? a;
