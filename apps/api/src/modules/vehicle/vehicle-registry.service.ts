// Vehicle Registry — public interface of module 2 (API Outline §5).
import { Inject, Injectable } from '@nestjs/common';
import { classifyIdentifier, type IdentifierKind } from '@sazo/contracts';
import { VehicleRepository, type IdentifierMatch } from './vehicle.repository.js';

export interface VehicleCard {
  vehicleRef: string;
  status: 'active' | 'provisional' | 'retired';
  currentPlate?: string;
  matchedOn: 'vin' | 'chassis_number' | 'registration_plate' | 'previous_plate';
  banner?: { severity: 'serious' | 'attention'; headlineKey: string };
}

export interface SearchOutcome {
  outcome: 'found' | 'multiple' | 'not_found' | 'invalid';
  queryKind: 'vin' | 'chassis' | 'plate' | 'unknown';
  normalizedQuery: string;
  matches: VehicleCard[];
  suggestion: { query: string; match: VehicleCard } | null;
}

const TYPES: Record<Exclude<IdentifierKind, 'unknown'>, string[]> = {
  vin: ['vin'],
  chassis: ['chassis_number'],
  plate: ['registration_plate'],
};

@Injectable()
export class VehicleRegistry {
  constructor(@Inject(VehicleRepository) private readonly repo: VehicleRepository) {}

  /**
   * Search by VIN, chassis number or plate. Never silently picks one vehicle when several match
   * (cloned/re-issued plates → "multiple"), and suggests corrections for O/I typos (G9).
   */
  async search(query: string): Promise<SearchOutcome> {
    const c = classifyIdentifier(query);
    if (c.kind === 'unknown') {
      return { outcome: 'invalid', queryKind: 'unknown', normalizedQuery: c.normalized, matches: [], suggestion: null };
    }
    const matches = await this.cards(await this.repo.findByIdentifier(TYPES[c.kind], c.normalized));
    let suggestion: SearchOutcome['suggestion'] = null;
    if (!matches.length && c.suggestion) {
      const [first] = await this.cards(await this.repo.findByIdentifier(TYPES[c.kind], c.suggestion));
      if (first) suggestion = { query: c.suggestion, match: first };
    }
    return {
      outcome: matches.length === 0 ? 'not_found' : matches.length === 1 ? 'found' : 'multiple',
      queryKind: c.kind,
      normalizedQuery: c.normalized,
      matches,
      suggestion,
    };
  }

  private async cards(rows: IdentifierMatch[]): Promise<VehicleCard[]> {
    return Promise.all(
      rows.map(async (r) => {
        const card: VehicleCard = {
          vehicleRef: r.publicRef,
          status: r.vehicleStatus as VehicleCard['status'],
          matchedOn: r.identifierType === 'registration_plate' && r.identifierStatus === 'historical'
            ? 'previous_plate'
            : (r.identifierType as VehicleCard['matchedOn']),
        };
        const plate = await this.repo.currentPlate(r.vehicleId);
        if (plate) card.currentPlate = plate;
        if (r.identifierStatus === 'disputed') card.banner = { severity: 'serious', headlineKey: 'identity.serious.cloned_plate_suspected' };
        return card;
      }),
    );
  }
}
