// Vehicle identifier handling: normalisation, classification and typo suggestions.
// Domain Model §2 (identity rules) and gap G9 ("did you mean").

export type IdentifierKind = 'vin' | 'chassis' | 'plate' | 'unknown';

export interface ClassifiedIdentifier {
  kind: IdentifierKind;
  /** Uppercase, no spaces, dashes or dots. This is what is stored in vehicle_identifiers.value_normalized. */
  normalized: string;
  /** A corrected form when the input looks like a VIN/chassis typed with O/I/Q instead of 0/1 (G9). */
  suggestion?: string;
}

/** Uppercase and strip whitespace, dashes and dots. */
export function normalizeIdentifier(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-.]/g, '');
}

// ISO 3779: 17 characters, digits and capital letters except I, O, Q.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// Japanese-style frame (chassis) numbers, e.g. ZSU60-0071234, NZT260-3048271, GP3-0123456.
// Model code (letters + digits + optional letters) followed by a 6–7 digit serial.
const CHASSIS_RE = /^([A-Z]{2,4}[0-9]{1,3}[A-Z]{0,2})([0-9]{6,7})$/;
// Ugandan plates, e.g. UBK 482M, UAX 123A. Some older/special formats have 4 digits or no final letter.
const PLATE_UG_RE = /^U[A-Z]{1,2}[0-9]{3,4}[A-Z]?$/;

/** Replace letters commonly typed by mistake for digits. */
function digitsForLookalikes(s: string): string {
  return s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/Q/g, '0');
}

export function isValidVin(normalized: string): boolean {
  return VIN_RE.test(normalized);
}

export function isChassisNumber(normalized: string): boolean {
  return CHASSIS_RE.test(normalized) && !VIN_RE.test(normalized);
}

/** Model code from a Japanese chassis number, e.g. "ZSU60-0071234" → "ZSU60". Used to infer the vehicle model. */
export function chassisModelCode(raw: string): string | undefined {
  const dashed = /^\s*([A-Za-z]{2,4}[0-9]{1,3}[A-Za-z]{0,2})\s*-\s*[0-9]{6,7}\s*$/.exec(raw);
  if (dashed?.[1]) return dashed[1].toUpperCase();
  const n = normalizeIdentifier(raw);
  // Serials are normally 7 digits; prefer that split, fall back to 6.
  return (CHASSIS_7_RE.exec(n) ?? CHASSIS_RE.exec(n))?.[1];
}
const CHASSIS_7_RE = /^([A-Z]{2,4}[0-9]{1,3}[A-Z]{0,2})([0-9]{7})$/;

/**
 * Work out what kind of identifier someone typed. Order matters: VIN, then chassis, then plate.
 * Never throws; unknown input returns kind "unknown".
 */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const normalized = normalizeIdentifier(raw);

  if (VIN_RE.test(normalized)) return { kind: 'vin', normalized };

  if (normalized.length === 17 && /^[A-Z0-9]{17}$/.test(normalized)) {
    // Looks like a VIN but contains I/O/Q: suggest the corrected VIN (only fix I/O/Q, keep other letters).
    const fixed = normalized.replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '0');
    if (VIN_RE.test(fixed)) return { kind: 'vin', normalized, suggestion: fixed };
  }

  if (CHASSIS_RE.test(normalized)) return { kind: 'chassis', normalized };

  // Chassis typed with O for 0 in the serial part, e.g. "ZSU60-OO71234".
  const chassisFix = /^([A-Z]{2,4}[0-9OIL]{1,3}[A-Z]{0,2})([0-9OIL]{6,7})$/.exec(normalized);
  if (chassisFix) {
    const code = chassisFix[1] ?? '';
    const serial = chassisFix[2] ?? '';
    const candidate = code.replace(/^([A-Z]{2,4})([0-9OIL]+)/, (_, l: string, d: string) => l + digitsForLookalikes(d)) +
      digitsForLookalikes(serial);
    if (CHASSIS_RE.test(candidate)) return { kind: 'chassis', normalized, suggestion: candidate };
  }

  if (PLATE_UG_RE.test(normalized)) return { kind: 'plate', normalized };

  return { kind: 'unknown', normalized };
}
