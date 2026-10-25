// Demo car pictures (development only, 25 Oct 2026): drawn illustrations of a car in a Kampala yard, from several
// angles like a real listing (side, front, back, a wheel, the dashboard). Shading, reflections, a shadow and a
// light grain make them look like photos; each seed changes the setting slightly so SAZO's copy checks pass.
// Number plates are left blank on purpose: demo pictures never show a plate.
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export type Body = 'sedan' | 'wagon' | 'suv' | 'minivan' | 'hatch';
export type View = 'side' | 'front' | 'rear' | 'wheel' | 'interior';
export const VIEWS: View[] = ['side', 'front', 'rear', 'wheel', 'interior'];

const W = 1200, H = 900;

export function bodyOf(model: string): Body {
  const m = model.toLowerCase();
  if (/harrier|x-trail|forester|rav4|prado|land cruiser|cx-5|outlander/.test(m)) return 'suv';
  if (/voxy|noah|wish|esquire|alphard|sienta/.test(m)) return 'minivan';
  if (/fielder|wagon|probox|succeed/.test(m)) return 'wagon';
  if (/fit|demio|aqua|vitz|note|march|swift/.test(m)) return 'hatch';
  return 'sedan';
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const shade = (hex: string, f: number) => {
  const [r, g, b] = rgb(hex).map((c) => Math.round(f >= 1 ? c + (255 - c) * (f - 1) : c * f));
  return `rgb(${r},${g},${b})`;
};

/** A seeded random number source, so the same seed always draws the same picture. */
function rng(seed: string) {
  let h = createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i >= 32) { h = createHash('sha256').update(h).digest(); i = 0; }
    return h[i++]! / 255;
  };
}

/** Sky, distant trees and roofs, a murram or concrete yard: a different mix for every seed. */
function setting(r: () => number, horizon: number) {
  const sky = r() > 0.5 ? ['#9cc8ef', '#e8f2fb'] : ['#b9d3e8', '#f3efe6'];
  const yard = r() > 0.45 ? ['#b5653d', '#8f4a2b'] : ['#a9a59c', '#7d7a73'];
  const trees = Array.from({ length: 9 }, (_, k) => {
    const x = k * 140 + r() * 80 - 40, rad = 50 + r() * 60;
    return `<circle cx="${x}" cy="${horizon - rad * 0.4}" r="${rad}" fill="rgb(${50 + r() * 30},${95 + r() * 40},${45 + r() * 25})" opacity="0.9"/>`;
  }).join('');
  const roofs = Array.from({ length: 4 }, () => {
    const x = r() * W, w = 120 + r() * 160, h = 50 + r() * 50;
    return `<rect x="${x}" y="${horizon - h}" width="${w}" height="${h}" fill="rgb(${200 + r() * 40},${190 + r() * 40},${170 + r() * 40})"/>
      <polygon points="${x - 10},${horizon - h} ${x + w / 2},${horizon - h - 35} ${x + w + 10},${horizon - h}" fill="rgb(${120 + r() * 50},${60 + r() * 30},${40 + r() * 20})"/>`;
  }).join('');
  return `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
      <linearGradient id="yard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${yard[0]}"/><stop offset="1" stop-color="${yard[1]}"/></linearGradient>
      <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${horizon}" fill="url(#sky)"/>${roofs}${trees}
    <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#yard)"/>
    ${Array.from({ length: 14 }, () => `<ellipse cx="${r() * W}" cy="${horizon + 40 + r() * (H - horizon - 60)}" rx="${8 + r() * 30}" ry="${3 + r() * 6}" fill="#000" opacity="${0.05 + r() * 0.08}"/>`).join('')}`;
}

function paint(colour: string) {
  return `<linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(colour, 1.35)}"/><stop offset="0.35" stop-color="${shade(colour, 1.08)}"/>
      <stop offset="0.7" stop-color="${shade(colour, 0.9)}"/><stop offset="1" stop-color="${shade(colour, 0.6)}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b6b7d"/><stop offset="0.45" stop-color="#1f2a36"/><stop offset="0.55" stop-color="#2c3a49"/><stop offset="1" stop-color="#121820"/></linearGradient>
    <radialGradient id="rim" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.6" stop-color="#a7afb8"/><stop offset="1" stop-color="#5d6570"/></radialGradient>`;
}

function wheel(cx: number, cy: number, r: number, spokes: number) {
  const s = Array.from({ length: spokes }, (_, k) => {
    const a = (k / spokes) * Math.PI * 2;
    return `<line x1="${cx + Math.cos(a) * r * 0.18}" y1="${cy + Math.sin(a) * r * 0.18}" x2="${cx + Math.cos(a) * r * 0.58}" y2="${cy + Math.sin(a) * r * 0.58}" stroke="#7b838d" stroke-width="${r * 0.11}" stroke-linecap="round"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#15181c"/><circle cx="${cx}" cy="${cy}" r="${r * 0.93}" fill="none" stroke="#2a2f35" stroke-width="${r * 0.05}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="url(#rim)"/>${s}<circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="#9aa2ab" stroke="#5d6570" stroke-width="3"/>`;
}

/** Side views by body: roof line, glass and arches. */
function side(body: Body, colour: string) {
  const y0 = 600; // sill line
  const shapes: Record<Body, { body: string; glass: string[]; front: number; rear: number; r: number }> = {
    sedan: { body: `M150 ${y0} L150 520 Q160 488 230 478 L360 470 Q420 395 520 380 L740 378 Q820 382 880 440 L1000 462 Q1060 470 1062 520 L1062 ${y0} Z`,
      glass: ['M410 470 L512 392 L620 390 L620 470 Z', 'M640 470 L640 390 L735 390 Q790 395 840 448 L860 470 Z'], front: 300, rear: 900, r: 66 },
    wagon: { body: `M140 ${y0} L140 515 Q150 485 220 476 L350 468 Q410 392 510 380 L960 378 Q1010 380 1030 430 L1060 470 L1062 ${y0} Z`,
      glass: ['M400 468 L505 392 L610 390 L610 468 Z', 'M630 468 L630 390 L800 390 L800 468 Z', 'M820 468 L820 390 L950 390 Q990 392 1005 440 L1012 468 Z'], front: 290, rear: 905, r: 66 },
    suv: { body: `M140 ${y0} L140 500 Q148 455 230 445 L350 438 Q400 340 500 326 L930 322 Q990 326 1018 400 L1050 450 Q1068 470 1066 520 L1066 ${y0} Z`,
      glass: ['M395 438 L492 340 L610 336 L610 438 Z', 'M630 438 L630 336 L800 334 L800 438 Z', 'M820 438 L820 334 L925 334 Q968 338 990 400 L1000 438 Z'], front: 300, rear: 905, r: 78 },
    minivan: { body: `M140 ${y0} L140 495 Q148 455 220 440 L300 420 Q370 320 470 300 L960 296 Q1020 298 1040 360 L1062 460 L1064 ${y0} Z`,
      glass: ['M320 420 L460 312 L590 308 L590 420 Z', 'M610 420 L610 308 L790 306 L790 420 Z', 'M810 420 L810 306 L955 306 Q1000 310 1015 370 L1022 420 Z'], front: 280, rear: 910, r: 70 },
    hatch: { body: `M200 ${y0} L200 520 Q208 490 270 480 L380 470 Q440 380 540 368 L820 366 Q880 370 905 430 L935 480 Q950 500 950 540 L950 ${y0} Z`,
      glass: ['M430 470 L532 380 L640 378 L640 470 Z', 'M660 470 L660 378 L815 378 Q860 384 880 440 L890 470 Z'], front: 340, rear: 830, r: 62 },
  };
  const s = shapes[body];
  const wy = y0 + 4;
  return `<ellipse cx="${(s.front + s.rear) / 2}" cy="${y0 + 72}" rx="${(s.rear - s.front) / 2 + 190}" ry="40" fill="url(#shadow)"/>
    <path d="${s.body}" fill="url(#paint)" stroke="${shade(colour, 0.45)}" stroke-width="3"/>
    <path d="M${s.front - 110} ${y0 - 18} L${s.rear + 110} ${y0 - 18}" stroke="${shade(colour, 0.7)}" stroke-width="5" opacity="0.7"/>
    <path d="M${s.front - 90} ${y0 - 105} Q${(s.front + s.rear) / 2} ${y0 - 125} ${s.rear + 100} ${y0 - 112}" stroke="#fff" stroke-width="10" opacity="0.22" fill="none"/>
    ${s.glass.map((g) => `<path d="${g}" fill="url(#glass)" stroke="#0d1117" stroke-width="4"/>`).join('')}
    <path d="M${s.front + 150} ${y0 - 60} L${s.front + 190} ${y0 - 60}" stroke="${shade(colour, 0.5)}" stroke-width="6" stroke-linecap="round"/>
    <path d="M${s.front + 380} ${y0 - 60} L${s.front + 420} ${y0 - 60}" stroke="${shade(colour, 0.5)}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${s.front - s.r - 10}" cy="${y0}" r="${s.r + 14}" fill="#0b0d10"/><circle cx="${s.rear + s.r - 50}" cy="${y0}" r="${s.r + 14}" fill="#0b0d10"/>
    ${wheel(s.front - s.r - 10, wy, s.r, 5)}${wheel(s.rear + s.r - 50, wy, s.r, 5)}
    <path d="M${s.rear + 140} ${y0 - 120} q22 4 26 30 l-20 2 z" fill="#ffe7a3" stroke="#806020" stroke-width="2"/>
    <rect x="${s.front - 150} " y="${y0 - 110}" width="34" height="22" rx="6" fill="#c0392b" opacity="0.9"/>`;
}

function front(body: Body, colour: string, rear: boolean) {
  const tall = body === 'suv' || body === 'minivan' ? 70 : 0;
  const top = 300 - tall, cx = 600;
  const lamp = rear ? '#c0392b' : '#fff4c8';
  return `<ellipse cx="${cx}" cy="735" rx="430" ry="45" fill="url(#shadow)"/>
    <path d="M250 700 L250 520 Q250 470 300 455 L380 ${top + 140} Q400 ${top} 470 ${top} L730 ${top} Q800 ${top} 820 ${top + 140} L900 455 Q950 470 950 520 L950 700 Z" fill="url(#paint)" stroke="${shade(colour, 0.45)}" stroke-width="3"/>
    <path d="M405 ${top + 145} Q420 ${top + 22} 480 ${top + 20} L720 ${top + 20} Q780 ${top + 22} 795 ${top + 145} Z" fill="url(#glass)" stroke="#0d1117" stroke-width="4"/>
    <path d="M440 ${top + 120} L560 ${top + 40}" stroke="#fff" stroke-width="14" opacity="0.18"/>
    <rect x="285" y="500" width="160" height="58" rx="18" fill="${lamp}" stroke="#333" stroke-width="3"/><rect x="755" y="500" width="160" height="58" rx="18" fill="${lamp}" stroke="#333" stroke-width="3"/>
    ${rear ? '<rect x="470" y="505" width="260" height="40" rx="8" fill="#20262d" opacity="0.6"/>' : '<rect x="470" y="510" width="260" height="70" rx="14" fill="#1b1f24"/><g stroke="#3a424b" stroke-width="5">' + Array.from({ length: 5 }, (_, k) => `<line x1="485" y1="${522 + k * 12}" x2="715" y2="${522 + k * 12}"/>`).join('') + '</g>'}
    <rect x="520" y="600" width="160" height="44" rx="5" fill="#fafafa" stroke="#555" stroke-width="3"/>
    <rect x="250" y="650" width="700" height="50" rx="10" fill="${shade(colour, 0.55)}"/>
    <rect x="250" y="690" width="110" height="60" rx="14" fill="#101215"/><rect x="840" y="690" width="110" height="60" rx="14" fill="#101215"/>`;
}

function wheelCloseUp(colour: string) {
  // The wheel seen from close by, under its arch in the side panel.
  return `<path d="M0 0 L1200 0 L1200 470 L1010 470 A410 410 0 0 0 190 470 L0 470 Z" fill="url(#paint)"/>
    <path d="M0 470 L190 470 A410 410 0 0 1 1010 470 L1200 470" fill="none" stroke="${shade(colour, 0.45)}" stroke-width="16"/>
    <path d="M0 130 L1200 110" stroke="#fff" stroke-width="18" opacity="0.18"/>
    <path d="M200 478 A400 400 0 0 1 1000 478 L1000 900 L200 900 Z" fill="#0b0d10"/>
    ${wheel(600, 600, 300, 6)}<circle cx="600" cy="600" r="122" fill="none" stroke="#7d5c45" stroke-width="16" opacity="0.55"/>`;
}

function interior(r: () => number) {
  const trim = r() > 0.5 ? '#2b2f36' : '#5a4636';
  return `<rect width="${W}" height="${H}" fill="#1b1e23"/>
    <path d="M0 0 L1200 0 L1200 330 Q600 250 0 330 Z" fill="url(#sky)" opacity="0.85"/>
    <path d="M0 330 Q600 250 1200 330 L1200 560 L0 560 Z" fill="${trim}"/>
    <path d="M0 520 Q600 450 1200 520 L1200 900 L0 900 Z" fill="#23272d"/>
    <rect x="300" y="380" width="360" height="140" rx="30" fill="#0d0f12" stroke="#3b4048" stroke-width="4"/>
    <circle cx="400" cy="450" r="52" fill="#11161c" stroke="#9fb7d1" stroke-width="3"/><circle cx="560" cy="450" r="52" fill="#11161c" stroke="#9fb7d1" stroke-width="3"/>
    <line x1="400" y1="450" x2="430" y2="420" stroke="#ff6b3d" stroke-width="5"/><line x1="560" y1="450" x2="525" y2="430" stroke="#ff6b3d" stroke-width="5"/>
    <circle cx="480" cy="640" r="190" fill="none" stroke="#0e1013" stroke-width="44"/><circle cx="480" cy="640" r="60" fill="#14171b"/>
    <rect x="780" y="400" width="240" height="150" rx="14" fill="#0f1720" stroke="#3b4048" stroke-width="4"/><rect x="800" y="420" width="200" height="110" rx="6" fill="#20354d" opacity="0.8"/>`;
}

/** A demo picture of a car: `view` picks the angle; `seed` makes it unique. */
export async function demoCarPhoto(seed: string, colour: string, body: Body, view: View): Promise<Buffer> {
  const r = rng(seed);
  const horizon = view === 'side' ? 470 + r() * 40 : 430 + r() * 40;
  const scene = view === 'interior' ? `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9cdee"/><stop offset="1" stop-color="#e9eef2"/></linearGradient></defs>` : setting(r, horizon);
  const car = view === 'side' ? side(body, colour) : view === 'front' ? front(body, colour, false) : view === 'rear' ? front(body, colour, true) : view === 'wheel' ? wheelCloseUp(colour) : interior(r);
  const still = view === 'wheel' || view === 'interior';
  const tilt = still ? 0 : (r() - 0.5) * 3, dx = still ? 0 : (r() - 0.5) * 60, scale = still ? 1 : 0.92 + r() * 0.1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${paint(colour)}</defs>${scene}
    <g transform="translate(${600 + dx} 450) rotate(${tilt}) scale(${scale}) translate(-600 -450)">${car}</g></svg>`;
  // A light grain, like a phone camera's.
  const noise = Buffer.alloc(W * H);
  const g = rng(`${seed}:grain`);
  for (let i = 0; i < noise.length; i++) noise[i] = 110 + Math.round(g() * 36); // a gentle grain around mid-grey
  const grain = await sharp(noise, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).png().toBuffer();
  return sharp(Buffer.from(svg)).composite([{ input: grain, blend: 'soft-light' }]).modulate({ brightness: 0.98 + r() * 0.06 }).jpeg({ quality: 84 }).toBuffer();
}
