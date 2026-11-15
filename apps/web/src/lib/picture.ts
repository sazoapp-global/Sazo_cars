// Logos and photos (D-186): any picture a person picks becomes a small square WebP before it goes to SAZO.
// A photo fills the square (cropped from the middle); a logo is fitted inside it on white, so nothing is cut off.
import sharp from 'sharp';
import { CONVERTED_TYPES, IMAGE_TYPES } from './upload-types';

/** The largest picture a person may pick; it is made much smaller before it is sent. */
export const PICTURE_MAX_BYTES = 8_000_000;
const SIDE = 320;

export class PictureProblem extends Error {}

export async function squarePicture(file: File, kind: 'photo' | 'logo'): Promise<{ image: string; mime: 'image/webp' }> {
  if (![...IMAGE_TYPES, ...CONVERTED_TYPES].includes(file.type)) throw new PictureProblem('Choose a JPG, PNG or WebP picture.');
  if (file.size > PICTURE_MAX_BYTES) throw new PictureProblem('This picture is too big. Choose one under 8 MB.');
  try {
    const base = sharp(Buffer.from(await file.arrayBuffer())).rotate();
    const pad = Math.round(SIDE * 0.07);
    let out = kind === 'photo'
      ? await base.resize(SIDE, SIDE, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer()
      : await base.flatten({ background: '#ffffff' }).resize(SIDE - 2 * pad, SIDE - 2 * pad, { fit: 'contain', background: '#ffffff' })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' }).webp({ quality: 88 }).toBuffer();
    // Keep it small: lower the quality until it fits what SAZO keeps.
    for (let q = 70; out.length > 90_000 && q >= 40; q -= 15) out = await sharp(out).webp({ quality: q }).toBuffer();
    return { image: out.toString('base64'), mime: 'image/webp' };
  } catch {
    throw new PictureProblem('This picture could not be read. Use a JPG, PNG or WebP picture.');
  }
}
