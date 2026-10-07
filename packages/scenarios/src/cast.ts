// The cast of sources from the Scenario Dataset §2 (all fictional / simulated).
import type { EngineSource } from '@sazo/trust-engine';

const src = (s: Omit<EngineSource, 'status' | 'isSimulated'> & Partial<EngineSource>): EngineSource => ({
  status: 'active',
  isSimulated: true,
  ...s,
});

export const SOURCES: Record<string, EngineSource> = {
  REG: src({ id: 'REG', organisationId: 'org-registry', domain: 'registration', evidenceClass: 'official', coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] }),
  CUS: src({ id: 'CUS', organisationId: 'org-customs', domain: 'customs', evidenceClass: 'official', coverage: [{ scope: 'imports_since', from: '2015-01-01' }] }),
  POL: src({ id: 'POL', organisationId: 'org-police', domain: 'police', evidenceClass: 'official', coverage: [{ scope: 'all_registered_vehicles', from: '2018-01-01' }] }),
  LIEN: src({ id: 'LIEN', organisationId: 'org-lien-registry', domain: 'finance', evidenceClass: 'official', coverage: [{ scope: 'all_registered_vehicles', from: '2019-01-01' }] }),
  'INS-N': src({ id: 'INS-N', organisationId: 'org-nile-assurance', domain: 'insurance', evidenceClass: 'official', coverage: [{ scope: 'own_customers', from: '2010-01-01' }] }),
  AUC: src({ id: 'AUC', organisationId: 'org-jp-auction', domain: 'auction', evidenceClass: 'official', coverage: [{ scope: 'own_stock', from: '2010-01-01' }] }),
  INSP: src({ id: 'INSP', organisationId: 'org-kvic', domain: 'inspection', evidenceClass: 'inspection', isSimulated: false, coverage: [{ scope: 'own_customers', from: '2010-01-01' }] }),
  RENT: src({ id: 'RENT', organisationId: 'org-kampala-car-hire', domain: 'rental', evidenceClass: 'official', coverage: [{ scope: 'own_fleet', from: '2010-01-01' }] }),
  DLR: src({ id: 'DLR', organisationId: 'org-ntinda-motors', domain: 'dealer', evidenceClass: 'dealer', isSimulated: false, coverage: [{ scope: 'own_stock', from: '2010-01-01' }] }),
  'GAR-NSA': src({ id: 'GAR-NSA', organisationId: 'org-nsambya-auto-care', domain: 'garage', evidenceClass: 'garage', isSimulated: false, attestationStats: { confirmed: 40, disputed: 0 }, coverage: [{ scope: 'own_customers', from: '2020-01-01' }] }),
  'GAR-MUT': src({ id: 'GAR-MUT', organisationId: 'org-mutungo-auto-works', domain: 'garage', evidenceClass: 'garage', isSimulated: false, attestationStats: { confirmed: 25, disputed: 0 }, coverage: [{ scope: 'own_customers', from: '2020-01-01' }] }),
  'GAR-BWE': src({ id: 'GAR-BWE', organisationId: 'org-bweyogerere-motor-clinic', domain: 'garage', evidenceClass: 'garage', isSimulated: false, attestationStats: { confirmed: 18, disputed: 0 }, coverage: [{ scope: 'own_customers', from: '2020-01-01' }] }),
  'GAR-KIR': src({ id: 'GAR-KIR', organisationId: 'org-kireka-quick-service', domain: 'garage', evidenceClass: 'garage', isSimulated: false, attestationStats: { confirmed: 6, disputed: 4 }, coverage: [{ scope: 'own_customers', from: '2020-01-01' }] }),
  OWN: src({ id: 'OWN', organisationId: 'org-owner-submissions', domain: 'owner', evidenceClass: 'owner_provided', isSimulated: false, coverage: [] }),
};

export const sourceMap = (overrides: Partial<Record<string, Partial<EngineSource>>> = {}): Map<string, EngineSource> =>
  new Map(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, ...(overrides[k] ?? {}) }]));

/** Test "today" (Scenario Dataset §1). */
export const AS_OF = '2026-10-01T00:00:00Z';
