// Shared enumerations. Values match the database CHECK constraints (db/migrations/0001_init.sql).

export const QUESTIONS = ['identity', 'care', 'damage', 'mileage', 'provenance', 'legal_financial', 'valuation'] as const;
export type Question = (typeof QUESTIONS)[number];

export const QUESTION_STATUSES = ['verified', 'attention', 'serious', 'not_available'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const EVIDENCE_CLASSES = ['official', 'garage', 'inspection', 'dealer', 'owner_provided', 'community'] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const SENSITIVITIES = ['public', 'restricted', 'confidential'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const TIME_PRECISIONS = ['exact', 'day', 'month', 'year', 'unknown'] as const;
export type TimePrecision = (typeof TIME_PRECISIONS)[number];

export const SOURCE_DOMAINS = [
  'registration', 'customs', 'police', 'finance', 'insurance', 'garage', 'inspection', 'auction',
  'rental', 'manufacturer', 'dealer', 'owner', 'community', 'reference',
] as const;
export type SourceDomain = (typeof SOURCE_DOMAINS)[number];

export const EVIDENCE_KINDS = [
  'odometer_photo', 'engine_number_photo', 'plate_photo', 'vehicle_photo', 'receipt', 'invoice',
  'part_photo', 'inspection_report', 'official_document', 'org_verification_document', 'other',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ATTESTER_KINDS = ['registered_owner', 'customer', 'inspector', 'organisation'] as const;
export type AttesterKind = (typeof ATTESTER_KINDS)[number];

export const RECORD_CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'insufficient'] as const;
export type RecordConfidenceLevel = (typeof RECORD_CONFIDENCE_LEVELS)[number];

export const CONFLICT_TOPICS = ['mileage', 'identity', 'ownership', 'damage', 'finance', 'spec', 'care', 'legal'] as const;
export type ConflictTopic = (typeof CONFLICT_TOPICS)[number];

export const CHECK_CODES = [
  'mileage_decrease', 'implausible_mileage_rate', 'undeclared_engine_change', 'plate_vin_mismatch',
  'cloned_plate_suspected', 'identity_collision', 'duplicate_suspected', 'date_impossible', 'spec_mismatch',
] as const;
export type CheckCode = (typeof CHECK_CODES)[number];

export const USAGE_TYPES = ['private', 'commercial', 'rental', 'psv'] as const;
export type UsageType = (typeof USAGE_TYPES)[number];
