/**
 * Standalone shape + coverage validator for scripts/prep-r2/r2-rubric-cases.json.
 *
 * - No runtime imports: this file is self-contained (node builtins only) and is NOT
 *   imported by any runtime code. It exists to qualify the synthetic R2 rubric dataset
 *   before the builder consumes the cases as pins for the model-driven risk assigner.
 * - The SENSITIVE_TOPIC snapshot below is copied from src/server/sensitive.ts so the
 *   check stays standalone. If sensitive.ts changes, refresh the snapshot; the runtime
 *   source of truth is always sensitive.ts.
 * - Usage: node scripts/prep-r2/validate-r2-cases.mjs [path-to-json]
 *   Exit 0 when every check passes, 1 otherwise. No provider calls, no network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.join(dir, 'r2-rubric-cases.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Snapshot of SENSITIVE_TOPIC from src/server/sensitive.ts @ e2f960c (standalone copy).
const SENSITIVE_TOPIC = /\b(health|illness|ill|sick|cancer|diagnos\w*|pregnan\w*|baby on the way|ivf|divorc\w*|separation|separated|affair|therap\w*|depress\w*|anxiety|anxious|panic attack|disabilit\w*|disabled|surgery|hospitali[sz]\w*|debt collectors?|arrears|bankrupt\w*|can't pay|cant pay|gambl\w*|addict\w*|religion|religious|church|mosque|prayer|politic\w*|election|trade union|dating|sexual\w*|ethnic\w*)\b/i;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
};

const LEVELS = [0, 1, 2];
const MODES = ['No permission', 'Review everything', 'High risk mode'];

/** Delegated rubric: highest applicable level wins. */
function deriveLevel(c) {
  const text = `${c.title} ${c.detail}`;
  if (SENSITIVE_TOPIC.test(text)) return 2;          // sensitive: guard floor
  if (c.source === 'external-disclosure') return 2;  // intended disclosure beyond the agents
  if (c.source === 'inference') return 2;            // unsupported inference
  if (c.source === 'bank-evidence') return 1;        // evidenced non-sensitive personal context
  if (c.source === 'customer') return 0;             // direct non-sensitive facts/intent
  if (c.source === 'generic') return 0;              // generic, non-personal
  return null;                                       // unknown source: flagged by shape check
}

const validAssignment = (a) => Number.isInteger(a) && a >= 0 && a <= 2;

/** Effective level the gate must use for a model-assigned case. */
function effectiveLevel(c) {
  const assigned = validAssignment(c.model_assignment) ? c.model_assignment : 2; // UNKNOWN = effective L2
  const floor = SENSITIVE_TOPIC.test(`${c.title} ${c.detail}`) ? 2 : 0;          // guard floor the model cannot lower
  return Math.max(assigned, floor);
}

// --- meta checks ---
check('meta present with provenance', !!data.meta && Array.isArray(data.meta.provenance) && data.meta.provenance.length > 0);
check('default mode is Review everything', data.meta?.default_mode === 'Review everything');
check('base commit recorded', typeof data.meta?.base_commit === 'string' && data.meta.base_commit.length === 40);

// --- case shape checks ---
const ids = new Set();
let shapeOk = true;
for (const c of data.cases ?? []) {
  const ok = typeof c.id === 'string' && c.id.length > 0 && !ids.has(c.id)
    && typeof c.category === 'string' && c.category.length > 0
    && typeof c.title === 'string' && c.title.length > 0
    && typeof c.detail === 'string' && c.detail.length > 0
    && typeof c.source === 'string' && ['customer', 'bank-evidence', 'inference', 'external-disclosure', 'generic'].includes(c.source)
    && LEVELS.includes(c.expected_level)
    && typeof c.reason === 'string' && c.reason.length >= 20;
  if (!ok) { shapeOk = false; console.log(`  shape problem: ${JSON.stringify(c.id)}`); }
  ids.add(c.id);
  if ('model_assignment' in c) {
    const effOk = LEVELS.includes(c.expected_effective_level);
    if (!effOk) { shapeOk = false; console.log(`  missing/invalid expected_effective_level: ${JSON.stringify(c.id)}`); }
  }
}
check(`all ${data.cases.length} cases well-shaped with unique ids`, shapeOk);

// --- rubric consistency: stated expectations match the delegated rubric derivation ---
for (const c of data.cases) {
  const derived = deriveLevel(c);
  check(`${c.id}: expected_level ${c.expected_level} matches rubric derivation`, derived === c.expected_level, `(derived ${derived})`);
  if ('model_assignment' in c) {
    check(`${c.id}: expected_effective_level ${c.expected_effective_level} matches effective-level rule`, effectiveLevel(c) === c.expected_effective_level, `(computed ${effectiveLevel(c)})`);
  }
}

// --- category placement checks ---
for (const c of data.cases) {
  const sensitive = SENSITIVE_TOPIC.test(`${c.title} ${c.detail}`);
  if (c.category === 'sensitive-direct-input') check(`${c.id}: category= sensitive-direct-input is sensitive customer input`, sensitive && c.source === 'customer');
  if (c.category === 'evidenced-non-sensitive-context') check(`${c.id}: category= evidenced context is non-sensitive bank evidence`, !sensitive && c.source === 'bank-evidence');
  if (c.category === 'direct-non-sensitive-fact') check(`${c.id}: category= direct fact is non-sensitive customer input`, !sensitive && c.source === 'customer');
  if (c.category === 'generic') check(`${c.id}: category= generic is non-sensitive generic source`, !sensitive && c.source === 'generic');
  if (c.category === 'unsupported-inference') check(`${c.id}: category= inference is a non-sensitive unsupported inference`, !sensitive && c.source === 'inference');
  if (c.category === 'external-disclosure') check(`${c.id}: category= disclosure is a non-sensitive external disclosure`, !sensitive && c.source === 'external-disclosure');
  if (c.category === 'malformed-model-assignment') check(`${c.id}: category= malformed has an invalid model assignment`, 'model_assignment' in c && !validAssignment(c.model_assignment));
  if (c.category === 'model-guard-floor') check(`${c.id}: category= guard-floor is sensitive content assigned below L2`, sensitive && validAssignment(c.model_assignment) && c.model_assignment < 2);
  if (c.category === 'model-valid-assignment') check(`${c.id}: category= valid-assignment matches rubric and effective`, validAssignment(c.model_assignment) && c.model_assignment === c.expected_level && c.expected_effective_level === c.expected_level);
}

// --- coverage: every required category present, min 2 cases each (3 for malformed) ---
const REQUIRED = {
  'sensitive-direct-input': 2,
  'evidenced-non-sensitive-context': 2,
  'direct-non-sensitive-fact': 2,
  'generic': 2,
  'goal-summary': 2,
  'unsupported-inference': 2,
  'external-disclosure': 2,
  'malformed-model-assignment': 3,
  'model-guard-floor': 2,
  'model-valid-assignment': 2,
};
for (const [cat, min] of Object.entries(REQUIRED)) {
  const n = data.cases.filter((c) => c.category === cat).length;
  check(`coverage: ${cat} has >= ${min} cases`, n >= min, `(has ${n})`);
}

// --- mode pass table: exact 3 modes x 4 level slots, rule-consistent ---
function expectedPass(mode, level) {
  const eff = level === 'UNKNOWN' ? 2 : level;
  if (mode === 'No permission') return true;                    // all levels pass
  if (mode === 'Review everything') return eff === 0;           // L1 + L2 (and UNKNOWN) blocked
  if (mode === 'High risk mode') return eff < 2;                // only L2 (and UNKNOWN) blocked
  return null;
}
const rows = data.mode_table ?? [];
check('mode table has exactly 12 rows (3 modes x 4 level slots)', rows.length === 12, `(has ${rows.length})`);
const seen = new Set();
let tableOk = true;
for (const r of rows) {
  const key = `${r.mode}|${r.level}`;
  const rule = expectedPass(r.mode, r.level);
  const ok = MODES.includes(r.mode) && (LEVELS.includes(r.level) || r.level === 'UNKNOWN')
    && !seen.has(key) && rule === r.can_pass
    && typeof r.ai_certified === 'boolean'
    && (r.level === 'UNKNOWN' ? r.ai_certified === false : true) // UNKNOWN is never AI certification
    && (r.can_pass === false ? r.ai_certified === false : true);
  if (!ok) { tableOk = false; console.log(`  mode_table problem: ${JSON.stringify(r)}`); }
  seen.add(key);
}
check('mode table rows match mode rules (No permission passes all; Review everything blocks L1+L2; High risk blocks L2; UNKNOWN = effective L2, never AI-certified)', tableOk);

console.log(`\n${passed} passed, ${failed} failed (${data.cases.length} cases, ${rows.length} mode rows) in ${path.basename(file)}`);
process.exit(failed === 0 ? 0 : 1);
