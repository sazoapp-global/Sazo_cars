// X-01: what SAZO can tell about a photo from the picture itself, without any outside service.
// Step 1 of the agreed plan: a fingerprint for spotting re-used photos, and basic quality (size, darkness).
// Reading the km/plate and sorting photos by what they show (steps 2–3) plug in later as 'content' checks.
import sharp from 'sharp';

export interface PhotoFacts {
  /** 64-bit difference hash as a signed bigint string (Postgres bigint). */
  dhash: string;
  width: number;
  height: number;
  /** Average brightness, 0 (black) to 255 (white). */
  brightness: number;
}

export interface CheckFinding {
  check: 'duplicate' | 'quality' | 'capture_time' | 'content';
  outcome: 'pass' | 'flag';
  reason?: 'same_photo_used_before' | 'near_copy_of_earlier_photo' | 'not_a_readable_image' | 'too_small' | 'too_dark' | 'taken_long_before_upload' | 'time_in_future';
  detail?: Record<string, unknown>;
}

export const PHOTO_RULES = {
  minSide: 320,
  minBrightness: 28,
  /** Fingerprints this many bits apart or fewer count as the same picture. */
  nearCopyBits: 6,
  /** A photo taken more than this long before it reached SAZO is flagged (offline phones upload the same day). */
  maxAgeHours: 72,
  futureToleranceMinutes: 10,
} as const;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Decode the picture and work out its fingerprint and brightness; undefined if it is not a readable image. */
export async function photoFacts(bytes: Buffer, mime: string): Promise<PhotoFacts | undefined> {
  if (!IMAGE_TYPES.has(mime)) return undefined;
  try {
    const img = sharp(bytes, { failOn: 'error' }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return undefined;
    const grey = img.clone().greyscale();
    const [{ data: tiny }, stats] = await Promise.all([
      grey.clone().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }),
      grey.clone().stats(),
    ]);
    let bits = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (tiny[y * 9 + x]! > tiny[y * 9 + x + 1]! ? 1n : 0n);
    const signed = BigInt.asIntN(64, bits);
    const portrait = (meta.orientation ?? 1) >= 5;
    return {
      dhash: signed.toString(),
      width: portrait ? meta.height : meta.width,
      height: portrait ? meta.width : meta.height,
      brightness: Math.round(stats.channels[0]!.mean),
    };
  } catch {
    return undefined;
  }
}

/** Findings that need only the picture and its capture time (no database). */
export function localFindings(mime: string, facts: PhotoFacts | undefined, capturedAt: Date | null, uploadedAt: Date): CheckFinding[] {
  const out: CheckFinding[] = [];
  if (IMAGE_TYPES.has(mime)) {
    if (!facts) out.push({ check: 'quality', outcome: 'flag', reason: 'not_a_readable_image' });
    else if (Math.min(facts.width, facts.height) < PHOTO_RULES.minSide) out.push({ check: 'quality', outcome: 'flag', reason: 'too_small', detail: { width: facts.width, height: facts.height } });
    else if (facts.brightness < PHOTO_RULES.minBrightness) out.push({ check: 'quality', outcome: 'flag', reason: 'too_dark', detail: { brightness: facts.brightness } });
    else out.push({ check: 'quality', outcome: 'pass' });
  }
  if (capturedAt) {
    const ageH = (uploadedAt.getTime() - capturedAt.getTime()) / 3_600_000;
    if (ageH > PHOTO_RULES.maxAgeHours) out.push({ check: 'capture_time', outcome: 'flag', reason: 'taken_long_before_upload', detail: { hours: Math.round(ageH) } });
    else if (-ageH * 60 > PHOTO_RULES.futureToleranceMinutes) out.push({ check: 'capture_time', outcome: 'flag', reason: 'time_in_future' });
    else out.push({ check: 'capture_time', outcome: 'pass' });
  }
  return out;
}

/** Plain words for each reason, for the people who have to act on it. */
export const REASON_TEXT: Record<NonNullable<CheckFinding['reason']>, string> = {
  same_photo_used_before: 'This exact photo was already sent to SAZO before',
  near_copy_of_earlier_photo: 'This looks like a copy of a photo already sent to SAZO',
  not_a_readable_image: 'This file is not a readable photo',
  too_small: 'The photo is too small to read',
  too_dark: 'The photo is too dark to read',
  taken_long_before_upload: 'The photo was taken long before it was sent',
  time_in_future: 'The photo has a time in the future',
};
