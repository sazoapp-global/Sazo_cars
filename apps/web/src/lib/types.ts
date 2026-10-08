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
  latestInspection?: LatestInspection | null;
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

// ---------- admin (SAZO staff)
export interface Organisation { id: string; type: string; legalName: string; tradingName: string | null; registrationNumber: string | null; district: string | null; status: string; createdAt: string }
export interface Conflict { conflictId: string; vehicleRef: string; relatedVehicleRefs: string[]; topic: string; status: string; openedByCheck: string | null; assignedTo: string | null; openedAt: string; resolvedAt: string | null }
export interface ConflictDetail extends Conflict {
  observations: { id: string; type: string; attributes: Record<string, unknown>; eventTime: string | null; precision: string; recordedAt: string; sourceCode?: string; evidenceClass: string; evidenceKinds: string[] }[];
  disputedPlates: string[];
  activity: { kind: string; actor: string | null; at: string; details: Record<string, unknown> }[];
  resolution: { interpretation?: string | null; reasoning?: string } | null;
}
export interface Decision { decisionId: string; submissionItemId: string; outcome: string; presentedIdentifiers: Record<string, string>; matchedVehicleRef?: string; candidateVehicleRefs: string[]; rule: string; decidedBy: 'system' | 'reviewer'; decidedAt: string }
export interface Source { id: string; code: string; name: string; domain: string; channel: string; isSimulated: boolean; evidenceClass: string; baselineReputation: number; status: 'active' | 'paused' | 'retired'; supersededBySourceId: string | null; coverage: { scope: string; periodFrom: string; periodTo: string | null }[] }

export interface MyOrganisation {
  id: string; type: string; legalName: string; tradingName: string | null; status: string; role: string;
  verificationStatus: 'open' | 'info_requested' | 'approved' | 'rejected' | null; infoRequested: string | null; documents: number;
}

// ---------- partner console
export interface PartnerSource { code: string; name: string; domain: string; channel: string; isSimulated: boolean; evidenceClass: string }
export interface SubmissionItem { sequence: number; status: 'pending' | 'accepted' | 'rejected' | 'needs_review'; vehicleRef?: string; resolution?: string; errors: { path: string; code: string; message: string }[] }
export interface Submission { submissionId: string; sourceCode: string; status: string; items: SubmissionItem[] }
export interface SubmissionSummary { submissionId: string; status: string; receivedAt: string; items: number; accepted: number; rejected: number; needsReview: number }

// ---------- buyer
export interface SavedCheck { vehicleRef: string; savedAt: string; summary: Summary }
export interface Comparison { vehicles: FullReport[]; differingQuestions: string[] }
export interface SharedReport { snapshotRef: string; vehicleRef: string; createdAt: string; expiresAt: string | null; report: FullReport }
export interface ShareLink { id: string; snapshotRef: string; vehicleRef: string; plate: string | null; createdAt: string; expiresAt: string | null; revoked: boolean }
export interface MyCar { vehicleRef: string; status: 'pending' | 'verified' | 'rejected'; method: 'phone_match' | 'logbook'; claimedAt: string; reason: string | null; summary?: Summary }
export interface Visit extends TimelineItem { ownerAnswer: 'confirmed' | 'disputed' | null; canAnswer: boolean }
export interface OwnershipClaim { claimId: string; vehicleRef: string; plate: string | null; claimant: string; claimedAt: string; evidenceIds: string[] }
export interface LatestInspection {
  date: string; sourceLabel: string; passed: boolean; structuralFindings: boolean | null; tyresPercent: number | null; batteryOk: boolean | null;
  defects: { item: string; severity: 'minor' | 'major' }[]; panelsMeasured: number; repaintedPanels: string[]; photos: number;
}
export interface StockItem {
  stockId: string; vehicleRef?: string; status: 'in_stock' | 'sold' | 'removed'; askingPriceUgx: number; listedMileageKm: number | null; notes: string | null;
  listedAt: string; soldAt: string | null; salePriceUgx: number | null; vehicle: VehicleCard | null; questions: QuestionView[]; recordConfidence: RecordConfidence | null;
}
export interface StaffMember { userId: string; displayName: string; role: string; status: string; joinedAt: string | null }
