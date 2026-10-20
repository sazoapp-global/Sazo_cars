// Real, distinct JPEGs for tests (X-01 photo checks reject text dressed up as a photo). Each seed gives
// its own pattern of blocks, so their fingerprints are far apart and no two count as copies.
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export async function testPhoto(seed: string, opts: { width?: number; height?: number; brightness?: number } = {}): Promise<Buffer> {
  const width = opts.width ?? 480, height = opts.height ?? 360;
  const scale = (opts.brightness ?? 160) / 160;
  let h = createHash('sha256').update(seed).digest();
  const px = Buffer.alloc(width * height * 3);
  const cols = 8, rows = 8;
  const cells: number[] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (i % 32 === 0 && i) h = createHash('sha256').update(h).digest();
    cells.push(Math.min(255, Math.round((40 + (h[i % 32]! % 200)) * scale)));
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = cells[Math.floor((y * rows) / height) * cols + Math.floor((x * cols) / width)]!;
    const o = (y * width + x) * 3;
    px[o] = v; px[o + 1] = v; px[o + 2] = Math.max(0, v - 20);
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

/** A night-time dashboard: almost all dark, with a small lit odometer display (average brightness about 14). */
export async function testDashboardPhoto(reading: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="100%" height="100%" fill="rgb(12,12,12)"/>
    <circle cx="600" cy="450" r="220" fill="rgb(22,22,26)" stroke="rgb(90,90,90)" stroke-width="8"/>
    <rect x="480" y="510" width="240" height="60" fill="rgb(20,40,20)"/>
    <text x="490" y="555" font-size="48" fill="rgb(180,255,180)" font-family="monospace">${reading}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
