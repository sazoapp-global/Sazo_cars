// Engine input/output types. The engine is pure: the Trust module loads data from the database,
// calls evaluateVehicle(), and stores the result as a derivation run (DM-12).
import type {
  AttesterKind,
  CheckCode,
  ConflictTopic,
  EvidenceClass,
  EvidenceKind,
  Question,
  QuestionStatus,
  RecordConfidenceLevel,
  SourceDomain,
  TimePrecision,
} from '@sazo/contracts';

export interface Coverage {
  scope: 'all_registered_vehicles' | 'imports_since' | 'own_customers' | 'own_fleet' | 'own_stock';
  from: string; // ISO date
  to?: string;
}

export interface EngineSource {
  id: string;
  organisationId: string;
  domain: SourceDomain;
  evidenceClass: EvidenceClass;
  isSimulated: boolean;
  status: 'active' | 'paused' | 'retired';
  supersededBySourceId?: string;
  /** Garages: attestation history used for reputation (Rule Set §2). */
  attestationStats?: { confirmed: number; disputed: number };
  suspendedAt?: string;
  coverage: Coverage[];
}

export interface EngineObservation {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  eventTime: string | null; // ISO date/time
  precision: TimePrecision;
  recordedAt: string;
  sourceId: string;
  eventId?: string;
  evidenceKinds: EvidenceKind[];
}

export interface EngineRelation {
  from: string;
  to: string;
  kind: 'corrects' | 'retracts' | 'duplicates' | 'corroborates';
}

export interface EngineAttestation {
  eventId?: string;
  observationId?: string;
  attesterKind: AttesterKind;
  response: 'confirmed' | 'disputed' | 'no_response';
}

/** Cross-vehicle identity findings supplied by the Vehicle Registry (C4–C7 need other vehicles). */
export interface IdentityAlert {
  check: Extract<CheckCode, 'plate_vin_mismatch' | 'cloned_plate_suspected' | 'identity_collision' | 'duplicate_suspected'>;
  observationIds: string[];
  relatedVehicleIds?: string[];
}

export interface VehicleInput {
  vehicleId: string;
  status: 'active' | 'provisional' | 'retired';
  identifiers: { type: 'vin' | 'chassis_number' | 'registration_plate' | 'engine_number' | 'import_reference'; value: string }[];
  observations: EngineObservation[];
  relations?: EngineRelation[];
  attestations?: EngineAttestation[];
  identityAlerts?: IdentityAlert[];
  /** Conflicts a reviewer has resolved/dismissed, by conflict key; they stop blocking "verified". */
  closedConflictKeys?: string[];
}

export interface EngineContext {
  asOf: string;
  sources: Map<string, EngineSource>;
  /** Number of comparable sales found by the Intelligence module (valuation status). */
  comparablesCount?: number;
}

// ---------- outputs

export interface Assessment {
  observationId: string;
  confidence: number;
  weak: boolean;
  excluded: boolean;
  exclusionReason?: 'retracted' | 'corrected' | 'retired_simulated_source' | 'duplicate';
  factors: Record<string, number | string>;
}

export interface Flag {
  check: CheckCode;
  severity: 'info' | 'attention' | 'serious';
  observationIds: string[];
  details?: Record<string, unknown>;
}

export interface ConflictCandidate {
  key: string;
  topic: ConflictTopic;
  observationIds: string[];
  openedByCheck: CheckCode | 'disputed_attestation';
  serious: boolean;
  open: boolean;
}

export interface Fact {
  value: unknown;
  confidence: number;
  estimated?: boolean;
  supporting: string[];
}

export interface QuestionAnswer {
  question: Question;
  status: QuestionStatus;
  headlineKey: string;
  params?: Record<string, unknown>;
  notes: { key: string; params?: Record<string, unknown> }[];
  basis: string[];
}

export interface HealthResult {
  insufficient: boolean;
  score: number | null;
  band: 'good' | 'fair' | 'poor' | null;
  deductions: { key: string; points: number }[];
  base?: number;
}

export interface EvaluationResult {
  vehicleId: string;
  asOf: string;
  ruleSetVersion: string;
  assessments: Assessment[];
  flags: Flag[];
  conflicts: ConflictCandidate[];
  facts: Record<string, Fact>;
  questions: Record<Question, QuestionAnswer>;
  recordConfidence: { level: RecordConfidenceLevel; records: number; sources: number; openConflicts: number };
  health: HealthResult;
}
