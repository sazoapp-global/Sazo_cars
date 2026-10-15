// Photos are evidence (D-057): shrunk on the phone to save data, then fingerprinted (SHA-256) so the
// server can prove the stored file is exactly the one taken.

const MAX_SIDE = 1600;

export async function shrink(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 900_000) return file;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch {
    return file; // old browsers: upload as taken
  }
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * X-01, the phone's own check: is the picture big and bright enough to read? It runs at once, offline,
 * so the mechanic can retake while the car is still in the bay. SAZO's server checks again on upload.
 * Same limits as the server (apps/api photo-checks.ts).
 */
export async function quickCheck(blob: Blob): Promise<'too_dark' | 'too_small' | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (Math.min(bitmap.width, bitmap.height) < 320) return 'too_small';
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    const px = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    return sum / (px.length / 4) < 28 ? 'too_dark' : undefined;
  } catch {
    return undefined; // can't tell on this phone — the server will check
  }
}
