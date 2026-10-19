// Plain words for the dealership screens (people who are not tech savvy read these).
import { formatDate } from '@sazo/contracts';
import { Icon } from '@/components/icon';
import { vehicleName } from '@/components/vehicle-card';
import type { ImportStage, StockItem } from '@/lib/types';

export const STAGES: [ImportStage, string][] = [
  ['bought', 'Bought'], ['shipping', 'Shipping'], ['at_port', 'At the port'], ['in_bond', 'In the bond'], ['cleared', 'Cleared'], ['at_yard', 'At the yard'],
];
export const stageLabel = (s: ImportStage) => STAGES.find(([k]) => k === s)?.[1] ?? s;

export const CUSTOMS: [string, string][] = [
  ['not_entered', 'Not entered yet'], ['in_bond', 'In the bond'], ['assessed', 'Tax assessed'], ['duty_paid', 'Tax paid'], ['released', 'Released'],
];

export const COSTS: [string, string][] = [
  ['purchase', 'Car price (purchase or auction)'], ['freight_insurance', 'Freight and marine insurance'], ['port_shipping', 'Port and shipping charges'],
  ['customs_taxes', 'Customs taxes'], ['clearing_agent', 'Clearing agent'], ['transport', 'Transport to the yard'],
  ['inspection_repairs', 'Inspection and repairs'], ['registration_plates', 'Registration and number plates'], ['other', 'Other'],
];
export const costLabel = (c: string) => COSTS.find(([k]) => k === c)?.[1] ?? c;

export const FUELS: [string, string][] = [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric'], ['lpg', 'Gas (LPG)'], ['other', 'Other']];
export const GEARS: [string, string][] = [['automatic', 'Automatic'], ['manual', 'Manual'], ['cvt', 'CVT'], ['other', 'Other']];

/** The car's name: SAZO's record once linked, otherwise what the dealer typed. */
export function carName(c: StockItem): string {
  if (c.vehicle && (c.vehicle.make || c.vehicle.model)) return vehicleName(c.vehicle);
  return [c.details.modelYear, c.details.make, c.details.model].filter(Boolean).join(' ') || 'Car';
}

/** Days in stock, coloured once the dealer's alert levels are passed. */
export function StockAge({ c }: { c: StockItem }) {
  const level = c.clocks.stockAgeLevel;
  const max = c.clocks.stockAgeAlertDays.length;
  const tone = level === 0 ? 'border-line bg-white text-on-surface' : level >= max ? 'border-bad-line bg-bad-fill text-bad-text' : 'border-warn-line bg-warn-fill text-warn-text';
  return <span className={`chip ${tone}`}><Icon name="schedule" size={14} />{c.clocks.daysInStock} {c.clocks.daysInStock === 1 ? 'day' : 'days'} in stock</span>;
}

/** The customs bond clock, only when the car is in a bond. Shows the deadline the dealer entered, never an invented one. */
export function BondClock({ c }: { c: StockItem }) {
  const b = c.clocks.bond;
  if (!b.applies) return null;
  if (b.level === 'none') return <span className="chip border-line bg-white text-muted"><Icon name="inventory_2" size={14} />In the bond{b.daysInBond !== null ? `, ${b.daysInBond} days` : ''}. No deadline entered</span>;
  const tone = b.level === 'overdue' ? 'border-bad-line bg-bad-fill text-bad-text' : b.level === 'soon' ? 'border-warn-line bg-warn-fill text-warn-text' : 'border-ok-line bg-ok-fill text-ok-text';
  const words = b.level === 'overdue' ? `Bond deadline passed ${formatDate(b.deadline)}` : `Bond deadline ${formatDate(b.deadline)}, ${b.daysLeft} ${b.daysLeft === 1 ? 'day' : 'days'} left`;
  return <span className={`chip ${tone}`}><Icon name="inventory_2" size={14} />{words}</span>;
}
