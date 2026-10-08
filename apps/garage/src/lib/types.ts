export interface Me {
  id: string;
  displayName: string;
  memberships: { organisationId: string; organisationName: string; organisationType: string; organisationStatus: string; role: string; status: string }[];
}

export interface Candidate {
  vehicleRef: string;
  status: 'active' | 'provisional' | 'retired';
  matchedOn: string;
  currentPlate?: string;
  make?: string; model?: string; year?: number; colour?: string;
  chassisLast4?: string; expectedEngineNumber?: string;
  lastMileage?: { km: number; on: string };
  banner?: { severity: 'serious' | 'attention'; headlineKey: string };
}
export interface Lookup { outcome: 'found' | 'multiple' | 'not_found'; candidates: Candidate[]; newVehicleRequires?: string[] }

export interface ServerJob {
  jobId: string;
  publicRef: string;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  plateEntered: string;
  vehicleRef?: string;
  workTypes: string[];
  form: Record<string, unknown> & { mileage?: { value: number; unit: string }; customer?: { name?: string; phoneMasked?: string; smsConsent?: boolean } };
  createdBy: { userId: string; displayName: string };
  clientCreatedAt: string;
  submittedAt: string | null;
  ownerConfirmation: 'confirmed' | 'disputed' | 'pending' | 'not_requested';
  acknowledgedWarnings: { code: string; explanation: string }[];
  rejectionReason: string | null;
  version: number;
}

export interface CheckWarning { code: string; severity: 'attention' | 'serious'; messageKey: string; params: Record<string, unknown>; blocking: boolean }

export interface SubmitResult {
  jobId: string; submissionId: string; status: 'submitted'; jobStatus: 'submitted' | 'accepted' | 'rejected';
  vehicleRef?: string; ownerConfirmation: 'pending' | 'not_requested'; rejectionReason?: string;
}

export interface StaffMember { userId: string; displayName: string; role: string; status: string; joinedAt: string | null }

/** The business the user is working for right now: a garage, or an inspector / inspection centre (same app). */
export interface Garage { id: string; name: string; role: string; type: string }
export const WORKPLACE_TYPES = ['garage', 'inspector', 'inspection_centre'];
export const isInspector = (w: Garage) => w.type === 'inspector' || w.type === 'inspection_centre';

export interface ServerInspection {
  inspectionId: string;
  publicRef: string;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  plateEntered: string;
  vehicleRef?: string;
  form: import('@sazo/contracts').InspectionForm;
  createdBy: { userId: string; displayName: string };
  clientCreatedAt: string;
  submittedAt: string | null;
  acknowledgedWarnings: { code: string; explanation: string }[];
  rejectionReason: string | null;
  version: number;
}
export interface InspectionWarning { code: string; severity: 'attention' | 'serious'; message: string; blocking: boolean }
export interface InspectionSubmitResult { inspectionId: string; submissionId: string; status: 'submitted' | 'accepted' | 'rejected'; vehicleRef?: string; rejectionReason?: string }
