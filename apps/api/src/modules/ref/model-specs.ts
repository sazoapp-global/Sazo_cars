// SAZO's model list with the kind of car and the maker's figures (D-148). Reference knowledge (D-015), not facts
// about any one car. TEST DATA: close to the makers' published figures but not loaded from them, so every figure is
// labelled "test data" on reports (spec_basis 'simulated') until real maker specifications replace this list.
// `codes` are the chassis model codes (the start of a Japanese chassis number); a code may belong to two models
// (NZE161: Axio saloon and Fielder station wagon), and SAZO then decides by the model, or asks.
import type { Drive, VehicleKind } from '@sazo/contracts';

export interface ModelSpec {
  make: string; model: string; kind: VehicleKind; codes: string[]; yearFrom: number;
  engineCc?: number; seats?: number; doors?: number; cylinders?: number; powerHp?: number; fuelKmPerL?: number;
  drive?: Drive; loadTonnes?: number; gvwTonnes?: number; axles?: number;
}

const car = (make: string, model: string, kind: VehicleKind, codes: string[], s: Omit<ModelSpec, 'make' | 'model' | 'kind' | 'codes' | 'yearFrom'>, yearFrom = 1990): ModelSpec =>
  ({ make, model, kind, codes, yearFrom, ...s });

export const MODEL_SPECS: ModelSpec[] = [
  // Saloons
  car('Toyota', 'Premio', 'saloon', ['NZT260', 'ZRT260', 'ZRT261', 'ZRT265', 'NZT240', 'ZZT240'], { engineCc: 1496, seats: 5, doors: 4, cylinders: 4, powerHp: 109, fuelKmPerL: 16.4, drive: '2wd' }),
  car('Toyota', 'Allion', 'saloon', ['NZT260', 'ZRT260', 'ZRT261', 'NZT240'], { engineCc: 1496, seats: 5, doors: 4, cylinders: 4, powerHp: 109, fuelKmPerL: 16.4, drive: '2wd' }),
  car('Toyota', 'Axio', 'saloon', ['NZE141', 'NZE161', 'NKE165', 'ZRE142'], { engineCc: 1496, seats: 5, doors: 4, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd' }),
  car('Toyota', 'Corolla Axio', 'saloon', ['NZE141', 'NZE161', 'NKE165', 'ZRE142'], { engineCc: 1496, seats: 5, doors: 4, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd' }),
  car('Toyota', 'Mark X', 'saloon', ['GRX130', 'GRX133', 'GRX120'], { engineCc: 2499, seats: 5, doors: 4, cylinders: 6, powerHp: 203, fuelKmPerL: 11.8, drive: '2wd' }),
  car('Toyota', 'Camry', 'saloon', ['ACV40', 'AVV50', 'ACV30'], { engineCc: 2362, seats: 5, doors: 4, cylinders: 4, powerHp: 158, fuelKmPerL: 12.0, drive: '2wd' }),
  car('Mercedes-Benz', 'C200', 'saloon', [], { engineCc: 1991, seats: 5, doors: 4, cylinders: 4, powerHp: 184, fuelKmPerL: 14.0, drive: '2wd' }),
  // Hatchbacks
  car('Toyota', 'Vitz', 'hatchback', ['KSP130', 'NSP130', 'NCP131', 'SCP90', 'KSP90'], { engineCc: 996, seats: 5, doors: 5, cylinders: 3, powerHp: 69, fuelKmPerL: 21.8, drive: '2wd' }),
  car('Toyota', 'Passo', 'hatchback', ['KGC30', 'KGC10', 'M700A'], { engineCc: 996, seats: 5, doors: 5, cylinders: 3, powerHp: 69, fuelKmPerL: 21.0, drive: '2wd' }),
  car('Honda', 'Fit', 'hatchback', ['GE6', 'GK3', 'GP1', 'GP5'], { engineCc: 1317, seats: 5, doors: 5, cylinders: 4, powerHp: 99, fuelKmPerL: 21.0, drive: '2wd' }),
  car('Toyota', 'Aqua', 'hatchback', ['NHP10'], { engineCc: 1496, seats: 5, doors: 5, cylinders: 4, powerHp: 100, fuelKmPerL: 33.8, drive: '2wd' }),
  car('Mazda', 'Demio', 'hatchback', ['DJ3FS', 'DE3FS', 'DE5FS', 'DJ5FS'], { engineCc: 1298, seats: 5, doors: 5, cylinders: 4, powerHp: 91, fuelKmPerL: 24.6, drive: '2wd' }),
  car('Nissan', 'Note', 'hatchback', ['E12', 'NE12', 'HE12', 'E11'], { engineCc: 1198, seats: 5, doors: 5, cylinders: 3, powerHp: 79, fuelKmPerL: 23.4, drive: '2wd' }),
  car('Subaru', 'Impreza', 'hatchback', ['GP2', 'GP3', 'GH2', 'GH3', 'GT2'], { engineCc: 1599, seats: 5, doors: 5, cylinders: 4, powerHp: 113, fuelKmPerL: 17.0, drive: 'awd' }),
  // Station wagons
  car('Toyota', 'Fielder', 'station_wagon', ['NZE141', 'NZE161', 'NKE165', 'ZRE142', 'NZE121'], { engineCc: 1496, seats: 5, doors: 5, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd' }),
  car('Toyota', 'Corolla Fielder', 'station_wagon', ['NZE141', 'NZE161', 'NKE165', 'ZRE142', 'NZE121'], { engineCc: 1496, seats: 5, doors: 5, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd' }),
  car('Toyota', 'Wish', 'station_wagon', ['ZGE20', 'ZGE21', 'ZNE10', 'ZNE14', 'ANE10'], { engineCc: 1797, seats: 7, doors: 5, cylinders: 4, powerHp: 142, fuelKmPerL: 15.0, drive: '2wd' }),
  car('Toyota', 'Ipsum', 'station_wagon', ['ACM21', 'ACM26', 'SXM10'], { engineCc: 2362, seats: 7, doors: 5, cylinders: 4, powerHp: 158, fuelKmPerL: 11.0, drive: '2wd' }),
  car('Toyota', 'Caldina', 'station_wagon', ['AZT241', 'ZZT241', 'ST215'], { engineCc: 1998, seats: 5, doors: 5, cylinders: 4, powerHp: 150, fuelKmPerL: 13.0, drive: '2wd' }),
  // SUVs
  car('Toyota', 'Harrier', 'suv', ['ZSU60', 'ZSU65', 'AVU65', 'ACU30', 'MCU30', 'GSU30'], { engineCc: 1986, seats: 5, doors: 5, cylinders: 4, powerHp: 151, fuelKmPerL: 15.2, drive: '2wd' }),
  car('Toyota', 'RAV4', 'suv', ['ACA31', 'ACA36', 'ACA21', 'MXAA54'], { engineCc: 1998, seats: 5, doors: 5, cylinders: 4, powerHp: 150, fuelKmPerL: 13.2, drive: '4wd' }),
  car('Toyota', 'Land Cruiser Prado', 'suv', ['TRJ150', 'GRJ150', 'GDJ150', 'KDJ120', 'TRJ120'], { engineCc: 2693, seats: 7, doors: 5, cylinders: 4, powerHp: 161, fuelKmPerL: 9.0, drive: '4wd' }),
  car('Toyota', 'Prado', 'suv', ['TRJ150', 'GRJ150', 'GDJ150', 'KDJ120', 'TRJ120'], { engineCc: 2693, seats: 7, doors: 5, cylinders: 4, powerHp: 161, fuelKmPerL: 9.0, drive: '4wd' }),
  car('Nissan', 'X-Trail', 'suv', ['NT31', 'NT32', 'T31', 'T32', 'HNT32'], { engineCc: 1997, seats: 5, doors: 5, cylinders: 4, powerHp: 147, fuelKmPerL: 15.6, drive: '4wd' }),
  car('Subaru', 'Forester', 'suv', ['SJ5', 'SH5', 'SJG', 'SK9'], { engineCc: 1995, seats: 5, doors: 5, cylinders: 4, powerHp: 148, fuelKmPerL: 15.2, drive: 'awd' }),
  car('Mazda', 'CX-5', 'suv', ['KE2FW', 'KE2AW', 'KEEFW', 'KF2P'], { engineCc: 2188, seats: 5, doors: 5, cylinders: 4, powerHp: 173, fuelKmPerL: 18.6, drive: '2wd' }),
  car('Honda', 'CR-V', 'suv', ['RM1', 'RM4', 'RE4', 'RW1'], { engineCc: 1997, seats: 5, doors: 5, cylinders: 4, powerHp: 150, fuelKmPerL: 14.4, drive: '2wd' }),
  car('Mitsubishi', 'Pajero', 'suv', ['V93W', 'V97W', 'V75W', 'V98W'], { engineCc: 3828, seats: 7, doors: 5, cylinders: 6, powerHp: 250, fuelKmPerL: 7.6, drive: '4wd' }),
  // Pickups
  car('Toyota', 'Hilux', 'pickup', ['GUN125', 'GUN126', 'KUN25', 'KUN26', 'LN166'], { engineCc: 2393, seats: 5, doors: 4, cylinders: 4, powerHp: 148, fuelKmPerL: 11.8, drive: '4wd', loadTonnes: 1.0, gvwTonnes: 2.9, axles: 2 }),
  car('Nissan', 'Navara', 'pickup', ['D40', 'D23'], { engineCc: 2488, seats: 5, doors: 4, cylinders: 4, powerHp: 161, fuelKmPerL: 11.0, drive: '4wd', loadTonnes: 1.0, gvwTonnes: 2.9, axles: 2 }),
  car('Isuzu', 'D-Max', 'pickup', ['TFR', 'TFS'], { engineCc: 2999, seats: 5, doors: 4, cylinders: 4, powerHp: 161, fuelKmPerL: 11.5, drive: '4wd', loadTonnes: 1.0, gvwTonnes: 2.95, axles: 2 }),
  // Vans
  car('Toyota', 'Noah', 'van', ['ZRR70', 'ZRR75', 'ZRR80', 'ZRR85', 'ZWR80', 'AZR60'], { engineCc: 1986, seats: 8, doors: 5, cylinders: 4, powerHp: 152, fuelKmPerL: 14.8, drive: '2wd' }),
  car('Toyota', 'Voxy', 'van', ['ZRR70', 'ZRR75', 'ZRR80', 'ZRR85', 'ZWR80', 'AZR60'], { engineCc: 1986, seats: 8, doors: 5, cylinders: 4, powerHp: 152, fuelKmPerL: 14.8, drive: '2wd' }),
  car('Toyota', 'Esquire', 'van', ['ZRR80', 'ZRR85', 'ZWR80'], { engineCc: 1986, seats: 7, doors: 5, cylinders: 4, powerHp: 152, fuelKmPerL: 16.0, drive: '2wd' }),
  car('Toyota', 'Probox', 'van', ['NCP160', 'NCP165', 'NCP50', 'NCP51'], { engineCc: 1496, seats: 5, doors: 5, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd', loadTonnes: 0.4 }),
  car('Toyota', 'Succeed', 'van', ['NCP160', 'NCP165', 'NCP58'], { engineCc: 1496, seats: 5, doors: 5, cylinders: 4, powerHp: 109, fuelKmPerL: 19.6, drive: '2wd', loadTonnes: 0.4 }),
  car('Nissan', 'Caravan', 'van', ['VR2E26', 'CW8E26', 'E25'], { engineCc: 2488, seats: 3, doors: 4, cylinders: 4, powerHp: 129, fuelKmPerL: 10.0, drive: '2wd', loadTonnes: 1.2, gvwTonnes: 3.1, axles: 2 }),
  // Minibus (taxi) and the Hiace van (the chassis code tells them apart)
  car('Toyota', 'Hiace', 'minibus', ['KDH223', 'TRH223', 'GDH223', 'LH162'], { engineCc: 2982, seats: 14, doors: 4, cylinders: 4, powerHp: 136, fuelKmPerL: 9.5, drive: '2wd', gvwTonnes: 3.3, axles: 2 }),
  car('Toyota', 'Hiace Van', 'van', ['KDH200', 'KDH201', 'TRH200', 'KDH206', 'GDH201'], { engineCc: 2982, seats: 3, doors: 4, cylinders: 4, powerHp: 136, fuelKmPerL: 10.4, drive: '2wd', loadTonnes: 1.25, gvwTonnes: 3.1, axles: 2 }),
  // Buses
  car('Toyota', 'Coaster', 'bus', ['XZB50', 'XZB40', 'HZB50', 'BB50'], { engineCc: 4009, seats: 29, doors: 2, cylinders: 4, powerHp: 150, fuelKmPerL: 6.0, drive: '2wd', gvwTonnes: 5.5, axles: 2 }),
  car('Mitsubishi', 'Rosa', 'bus', ['BE64', 'BE63'], { engineCc: 4899, seats: 29, doors: 2, cylinders: 4, powerHp: 150, fuelKmPerL: 5.5, drive: '2wd', gvwTonnes: 5.7, axles: 2 }),
  // Trucks (lorries)
  car('Isuzu', 'Forward', 'truck', ['FRR90', 'FRR34', 'FSR34', 'FTR34'], { engineCc: 5193, seats: 3, doors: 2, cylinders: 4, powerHp: 210, fuelKmPerL: 5.0, drive: '2wd', loadTonnes: 6.5, gvwTonnes: 11.0, axles: 2 }),
  car('Isuzu', 'Elf', 'truck', ['NKR85', 'NPR85', 'NKR71', 'NPR75'], { engineCc: 2999, seats: 3, doors: 2, cylinders: 4, powerHp: 150, fuelKmPerL: 8.0, drive: '2wd', loadTonnes: 2.0, gvwTonnes: 5.0, axles: 2 }),
  car('Mitsubishi', 'Fuso Canter', 'truck', ['FEB50', 'FE7', 'FE8', 'FBA20'], { engineCc: 2998, seats: 3, doors: 2, cylinders: 4, powerHp: 150, fuelKmPerL: 8.5, drive: '2wd', loadTonnes: 3.0, gvwTonnes: 6.0, axles: 2 }),
  car('Toyota', 'Dyna', 'truck', ['XZU710', 'XZU600', 'BU306'], { engineCc: 4009, seats: 3, doors: 2, cylinders: 4, powerHp: 150, fuelKmPerL: 8.0, drive: '2wd', loadTonnes: 3.0, gvwTonnes: 6.5, axles: 2 }),
  // Coupe or convertible
  car('Toyota', '86', 'coupe_convertible', ['ZN6'], { engineCc: 1998, seats: 4, doors: 2, cylinders: 4, powerHp: 197, fuelKmPerL: 12.4, drive: '2wd' }),
  car('Mazda', 'Roadster', 'coupe_convertible', ['ND5RC', 'NCEC'], { engineCc: 1496, seats: 2, doors: 2, cylinders: 4, powerHp: 129, fuelKmPerL: 17.2, drive: '2wd' }),
  // Two kinds under one name: no single kind, SAZO decides by the chassis code or asks (D-148).
  car('Toyota', 'Corolla', 'saloon', [], { engineCc: 1496, seats: 5, cylinders: 4, drive: '2wd' }),
  car('Toyota', 'Land Cruiser', 'suv', ['URJ202', 'UZJ200', 'VDJ200', 'HDJ100'], { engineCc: 4608, seats: 8, doors: 5, cylinders: 8, powerHp: 304, fuelKmPerL: 6.7, drive: '4wd' }),
  car('Toyota', 'Land Cruiser Pickup', 'pickup', ['GRJ79', 'HZJ79', 'VDJ79'], { engineCc: 4461, seats: 3, doors: 2, cylinders: 8, powerHp: 202, fuelKmPerL: 7.0, drive: '4wd', loadTonnes: 1.2, gvwTonnes: 3.4, axles: 2 }),
];

/** Model names that cover more than one kind; a car with only this name is identified by its chassis code or asked about. */
export const MIXED_KIND_MODELS: { make: string; model: string; kinds: VehicleKind[] }[] = [
  { make: 'Toyota', model: 'Corolla', kinds: ['saloon', 'station_wagon', 'hatchback'] },
  { make: 'Toyota', model: 'Land Cruiser', kinds: ['suv', 'pickup'] },
  { make: 'Toyota', model: 'Hiace', kinds: ['minibus', 'van'] },
];
