// Demo data only (D-146): Kisementi Motors' past sales over the last 12 months and how each buyer pays, so the
// dealer dashboard's monthly graph and the Payments pages have something to show. All names, phones, plates and
// figures are made up. `paid` = how many monthly payments the buyer made, each on its due date; `part` = one more
// payment of part of the next amount, a few days after it was due (so that payment shows as late).

export type DemoMethod = 'cash' | 'mtn_momo' | 'airtel_money' | 'bank';
export interface DemoSale {
  make: string; model: string; year: number; colour: string; plate: string; chassis: string;
  asking: number; price: number; soldDaysAgo: number;
  buyer: { name: string; phone: string };
  plan: { kind: 'cash'; method: DemoMethod } | {
    kind: 'instalments'; deposit: number; depositMethod: DemoMethod; months: number; firstDueAfterDays: number; paid: number;
    part?: { amount: number; method: DemoMethod; daysAfterDue: number }; reminders?: boolean;
  };
}

export const DEMO_SALES: DemoSale[] = [
  { make: 'toyota', model: 'harrier', year: 2016, colour: 'black', plate: 'UBQ 905A', chassis: 'ZSU60-0905105', asking: 54_000_000, price: 52_000_000, soldDaysAgo: 200,
    buyer: { name: 'Peter Mugisha', phone: '+256752100101' },
    plan: { kind: 'instalments', deposit: 20_000_000, depositMethod: 'bank', months: 10, firstDueAfterDays: 30, paid: 6 } },
  { make: 'toyota', model: 'premio', year: 2017, colour: 'pearl white', plate: 'UBK 482D', chassis: 'NZT260-0482204', asking: 41_000_000, price: 40_000_000, soldDaysAgo: 140,
    buyer: { name: 'Sarah Kemigisha', phone: '+256752100102' },
    plan: { kind: 'instalments', deposit: 10_000_000, depositMethod: 'mtn_momo', months: 12, firstDueAfterDays: 30, paid: 3, part: { amount: 2_100_000, method: 'mtn_momo', daysAfterDue: 2 } } },
  { make: 'nissan', model: 'x-trail', year: 2014, colour: 'grey', plate: 'UBM 330F', chassis: 'NT31-0330116', asking: 34_500_000, price: 33_000_000, soldDaysAgo: 100,
    buyer: { name: 'Grace Nanyonga', phone: '+256752100103' },
    plan: { kind: 'instalments', deposit: 13_000_000, depositMethod: 'cash', months: 8, firstDueAfterDays: 30, paid: 3 } },
  { make: 'subaru', model: 'forester', year: 2014, colour: 'blue', plate: 'UBN 107C', chassis: 'SJ5-0107331', asking: 31_000_000, price: 29_500_000, soldDaysAgo: 75,
    buyer: { name: 'David Okello', phone: '+256752100104' },
    plan: { kind: 'instalments', deposit: 11_500_000, depositMethod: 'airtel_money', months: 6, firstDueAfterDays: 30, paid: 1 } },
  { make: 'toyota', model: 'fielder', year: 2013, colour: 'silver', plate: 'UBG 266L', chassis: 'NZE161-0266420', asking: 27_000_000, price: 26_000_000, soldDaysAgo: 260,
    buyer: { name: 'Juliet Akello', phone: '+256752100105' },
    plan: { kind: 'instalments', deposit: 14_000_000, depositMethod: 'cash', months: 6, firstDueAfterDays: 30, paid: 6 } },
  { make: 'toyota', model: 'wish', year: 2013, colour: 'white', plate: 'UBJ 771K', chassis: 'ZGE20-0771522', asking: 22_000_000, price: 21_000_000, soldDaysAgo: 30,
    buyer: { name: 'Moses Tumusiime', phone: '+256752100106' }, plan: { kind: 'cash', method: 'bank' } },
  { make: 'toyota', model: 'vitz', year: 2014, colour: 'red', plate: 'UBF 512B', chassis: 'KSP130-0512623', asking: 18_500_000, price: 17_800_000, soldDaysAgo: 10,
    buyer: { name: 'Esther Namirembe', phone: '+256752100107' }, plan: { kind: 'cash', method: 'mtn_momo' } },
  { make: 'toyota', model: 'rav4', year: 2015, colour: 'grey', plate: 'UBH 640R', chassis: 'ACA31-0640724', asking: 49_000_000, price: 47_500_000, soldDaysAgo: 45,
    buyer: { name: 'Ronald Kasozi', phone: '+256752100108' }, plan: { kind: 'cash', method: 'bank' } },
  { make: 'mazda', model: 'demio', year: 2014, colour: 'blue', plate: 'UBD 218M', chassis: 'DJ3FS-0218825', asking: 19_000_000, price: 18_200_000, soldDaysAgo: 120,
    buyer: { name: 'Agnes Atuhaire', phone: '+256752100109' }, plan: { kind: 'cash', method: 'cash' } },
  { make: 'toyota', model: 'noah', year: 2014, colour: 'white', plate: 'UBE 377N', chassis: 'ZRR70-0377926', asking: 39_000_000, price: 37_500_000, soldDaysAgo: 165,
    buyer: { name: 'Isaac Byaruhanga', phone: '+256752100110' }, plan: { kind: 'cash', method: 'airtel_money' } },
  { make: 'honda', model: 'cr-v', year: 2013, colour: 'black', plate: 'UBC 905H', chassis: 'RM1-0905127', asking: 43_000_000, price: 41_000_000, soldDaysAgo: 230,
    buyer: { name: 'Patience Nakimuli', phone: '+256752100111' }, plan: { kind: 'cash', method: 'bank' } },
  { make: 'toyota', model: 'premio', year: 2015, colour: 'grey', plate: 'UBB 433P', chassis: 'NZT260-0433228', asking: 36_000_000, price: 35_000_000, soldDaysAgo: 290,
    buyer: { name: 'Henry Ssekandi', phone: '+256752100112' }, plan: { kind: 'cash', method: 'cash' } },
  { make: 'toyota', model: 'axio', year: 2012, colour: 'silver', plate: 'UBA 118X', chassis: 'NZE161-0118329', asking: 25_500_000, price: 24_600_000, soldDaysAgo: 320,
    buyer: { name: 'Florence Auma', phone: '+256752100113' }, plan: { kind: 'cash', method: 'mtn_momo' } },
  { make: 'nissan', model: 'note', year: 2014, colour: 'orange', plate: 'UBA 902N', chassis: 'E12-0902330', asking: 17_500_000, price: 16_900_000, soldDaysAgo: 345,
    buyer: { name: 'Samuel Opio', phone: '+256752100114' }, plan: { kind: 'cash', method: 'cash' } },
  { make: 'toyota', model: 'land cruiser prado', year: 2012, colour: 'pearl white', plate: 'UBG 701V', chassis: 'TRJ150-0701431', asking: 118_000_000, price: 112_000_000, soldDaysAgo: 25,
    buyer: { name: 'Charles Mwesigwa', phone: '+256752100115' },
    plan: { kind: 'instalments', deposit: 60_000_000, depositMethod: 'bank', months: 12, firstDueAfterDays: 30, paid: 0 } },
];
