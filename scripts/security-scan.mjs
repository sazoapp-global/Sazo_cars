#!/usr/bin/env node
// Security scan for SAZO (used by the sazo-security-review skill; safe to run any time, changes nothing).
// 1. Route inventory: every API route and how it is guarded (public / permission / organisation / signed-in only).
// 2. Risky patterns worth a human look (raw HTML, SQL built from variables, unsafe links, weak randomness, logging).
// 3. Known-vulnerable dependencies (npm audit, production dependencies only).
// Usage: node scripts/security-scan.mjs [--json]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (['node_modules', 'dist', '.next', 'dev-dist', 'test-results', 'playwright-report'].includes(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(root, p);
const files = ['apps', 'packages'].flatMap((d) => walk(path.join(root, d)));
const src = files.filter((f) => !/\.(test|spec)\.tsx?$/.test(f) && !f.includes('/e2e/'));

// ---------- 1. Route inventory
const routes = [];
for (const f of src.filter((x) => x.endsWith('.controller.ts'))) {
  const text = readFileSync(f, 'utf8');
  const base = text.match(/@Controller\((?:'([^']*)')?\)/)?.[1] ?? '';
  const classPublic = /@Public\(\)\s*(?:@\w+\([^)]*\)\s*)*export class/.test(text);
  const re = /((?:\s*@\w+\([^)]*\)\s*)+)\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)[^{]*\{/g;
  for (const m of text.matchAll(re)) {
    const decos = m[1];
    const verb = decos.match(/@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/);
    if (!verb) continue;
    // Method body: up to the next decorator block at class level.
    const start = m.index + m[0].length;
    const next = text.slice(start).search(/\n {2}(?:\/\*\*|@\w+\()/);
    const body = text.slice(start, next < 0 ? undefined : start + next);
    const perm = decos.match(/@RequirePermission\('([^']+)'\)/)?.[1];
    const guard = /@Public\(\)/.test(decos) || classPublic ? 'public'
      : perm ? `permission ${perm}`
      : /this\.org\(|canForOrg\(/.test(body) ? 'organisation member'
      : /\bactor\b/.test(body) ? 'signed in; uses caller — CHECK the query filters on them'
      : 'signed in only — CHECK';
    routes.push({ method: verb[1].toUpperCase(), path: `/v1/${[base, verb[2]].filter(Boolean).join('/')}`, guard, file: rel(f) });
  }
}

// ---------- 2. Risky patterns
const PATTERNS = [
  { id: 'raw-html', why: 'raw HTML can run scripts (XSS)', re: /dangerouslySetInnerHTML|innerHTML\s*=/ },
  { id: 'eval', why: 'runs strings as code', re: /\beval\(|new Function\(/ },
  { id: 'sql-interpolation', why: 'SQL built from a variable — make sure it is never user input', re: /(?:query|query<[^>]*>)\(\s*`[^`]*\$\{(?!COLS\b|cols\b)[^}]+\}/ },
  { id: 'blank-target', why: 'opens a new tab without rel="noopener"', re: /target="_blank"(?![^>]*rel=)/ },
  { id: 'weak-random', why: 'Math.random is guessable — use crypto for tokens and codes', re: /Math\.random\(/ },
  { id: 'console-log', why: 'logs can leak phone numbers, codes or tokens', re: /console\.(log|info|debug)\(/ },
  { id: 'jwt-none', why: 'JWT verified without pinning the algorithm', re: /jwtVerify\((?![^)]*algorithms)/ },
  { id: 'secret-literal', why: 'a secret written into the code', re: /(SECRET|PASSWORD|API_KEY)\s*[:=]\s*['"][^'"]{8,}['"]/ },
];
const hits = [];
for (const f of src) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const p of PATTERNS) if (p.re.test(line)) hits.push({ pattern: p.id, why: p.why, at: `${rel(f)}:${i + 1}`, line: line.trim().slice(0, 160) });
  });
}

// ---------- 3. Dependencies
let audit;
try {
  execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  audit = 'no known vulnerabilities in production dependencies';
} catch (err) {
  try {
    const v = JSON.parse(String(err.stdout)).metadata?.vulnerabilities ?? {};
    audit = Object.entries(v).filter(([k, n]) => k !== 'total' && n).map(([k, n]) => `${n} ${k}`).join(', ') || 'audit failed to run (offline?)';
  } catch { audit = 'audit failed to run (offline?)'; }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ routes, hits, audit }, null, 2));
} else {
  const check = routes.filter((r) => r.guard.includes('CHECK'));
  const self = routes.filter((r) => r.guard.startsWith('signed in; uses caller'));
  console.log(`# SAZO security scan — ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`## Routes (${routes.length}) — ${routes.filter((r) => r.guard === 'public').length} public, ${check.length} to check by hand (${self.length} of them act on the caller's own data)\n`);
  console.log('| Method | Path | Guard | File |\n|---|---|---|---|');
  for (const r of routes.sort((a, b) => a.guard.localeCompare(b.guard) || a.path.localeCompare(b.path))) console.log(`| ${r.method} | ${r.path} | ${r.guard} | ${r.file} |`);
  console.log(`\n## Patterns to look at (${hits.length})\n`);
  for (const h of hits) console.log(`- **${h.pattern}** (${h.why}) — \`${h.at}\`: \`${h.line.replace(/`/g, "'")}\``);
  console.log(`\n## Dependencies\n\n${audit}`);
}
