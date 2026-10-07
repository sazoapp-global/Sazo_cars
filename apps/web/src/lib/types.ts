// Shapes returned by the SAZO API (docs/api/sazo-api-v1.yaml). Kept narrow: only what the screens read.
export type Status = 'verified' | 'attention' | 'serious' | 'not_available';

export interface VehicleCard {
  vehicleRef: string;
  status: 'active' | 'provisional' | 'retired';
  matchedOn: 'vin' | 'chassis_number' | 'registration_plate' | 'previous_plate';
  currentPlate?: string;
  make?: string;
  model?: string;
  year?: number;
  banner?: { severity: 'serious' | 'attention'; headlineKey: string };
}

export interface SearchResult {
  outcome: 'found' | 'multiple' | 'not_found' | 'invalid';
  queryKind: 'vin' | 'chassis' | 'plate' | 'unknown';
  normalizedQuery: string;
  matches: VehicleCard[];
  suggestion: { query: string; match: VehicleCard } | null;
  simulatedDataNotice: boolean;
}

export interface QuestionView {
  question: string;
  status: Status;
  headlineKey: string;
  params?: Record<string, unknown>;
  notes?: { key: string; params?: Record<string, unknown> }[];
}

export interface RecordConfidence { level: 'high' | 'medium' | 'low' | 'insufficient'; records: number; sources: number; openConflicts: number }

export interface Summary {
  vehicle: VehicleCard;
  questions: QuestionView[];
  recordConfidence: RecordConfidence;
  asOf: string;
  signInForDetails: boolean;
}

export interface FullReport {
  vehicle: VehicleCard;
  questions: QuestionView[];
  recordConfidence: RecordConfidence;
  health: { insufficient: boolean; score: number | null; band: 'good' | 'fair' | 'poor' | null; deductions: { key: string; points: number }[] };
  valuation: { status: Status; comparablesCount: number; isEstimate: true; range?: { lowUgx: number; midUgx: number; highUgx: number; comparables: number } };
  facts: { key: string; value: unknown; confidence: number; estimated: boolean }[];
  openConflicts: { topic: string; headlineKey: string }[];
  asOf: string;
  ruleSetVersion: string;
}

export interface TimelineItem {
  eventId: string;
  type: string;
  time: { at: string | null; precision: string };
  evidenceClass: string;
  sourceLabel: string;
  summaryKey: string;
  params: { records?: string[] } & Record<string, unknown>;
  mileageKm: number | null;
  evidenceCount: number;
  ownerConfirmation: 'confirmed' | 'disputed' | 'pending' | 'not_requested';
  flags: { check: string; severity: string }[];
}

export interface LedgerItem {
  observationId: string;
  eventId: string | null;
  type: string;
  attributes: Record<string, unknown>;
  time: { at: string | null; precision: string };
  recordedAt: string;
  evidenceClass: string;
  sourceLabel: string;
  confidence: number;
  excluded: boolean;
  exclusionReason: string | null;
  evidence: { kind: string }[];
}

export interface Me {
  id: string;
  displayName: string;
  platformRoles: string[];
  memberships: { organisationId: string; organisationName: string; organisationType: string; organisationStatus: string; role: string; status: string }[];
}

export interface AttestationView {
  garageName: string;
  eventDate: string;
  plate: string;
  workSummaryKey: string;
  params: { workTypes?: string[] };
  mileageKm: number | null;
  expiresAt: string;
  answered: 'confirmed' | 'disputed' | null;
}
