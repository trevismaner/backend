/**
 * Tests the pre-build peer-dependency check.
 *
 *   node tests/peer_deps.test.mjs
 *
 * The check in scripts/checkPeerDeps.mjs does its own semver range matching, on purpose:
 * depending on the `semver` package would make it stop working whenever it ran before
 * `npm install`, and a check that prints "nothing would fail" without having looked is
 * worse than no check. The cost of that choice is that the matching has to be proved.
 *
 * So this does two things:
 *
 *   1. Compares our matcher against the real `semver` package on every range/version pair
 *      actually present in package-lock.json, and on a battery of awkward synthetic ones.
 *      If semver is not installed those comparisons are skipped and said to be skipped.
 *   2. Checks the whole-lockfile verdict, including the regression this was written for:
 *      react-test-renderer@19.3.0 against the pinned react@19.2.3 must be reported.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { satisfies, check } from '../scripts/checkPeerDeps.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let passed = 0;
const failures = [];

const ok = (label, condition) => {
  if (condition) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}`); }
};

let semver = null;
try { semver = require('semver'); } catch { /* reported below */ }

// ── 1. our matcher vs the real thing, on synthetic cases ─────────────────────
console.log('\n━━━ range matching, awkward cases ━━━');

const cases = [
  // the regression
  ['19.2.3', '^19.3.0', false],
  ['19.3.0', '^19.3.0', true],
  ['19.2.3', '^19.2.3', true],
  // caret
  ['19.9.9', '^19.2.3', true],
  ['20.0.0', '^19.2.3', false],
  ['19.2.2', '^19.2.3', false],
  // 0.x carets are much tighter than they look, and are where this matcher first got it wrong
  ['0.3.1', '^0.3.0', true],
  ['0.4.0', '^0.3.0', false],
  ['0.0.2', '^0.0.2', true],
  ['0.0.3', '^0.0.2', false],
  ['0.1.0', '^0.0.2', false],
  ['0.0.5', '^0.0', true],
  ['0.1.0', '^0.0', false],
  ['0.9.9', '^0', true],
  ['1.0.0', '^0', false],
  ['0.2.0', '^0.1.0', false],
  // tilde
  ['1.2.9', '~1.2.3', true],
  ['1.3.0', '~1.2.3', false],
  ['1.9.0', '~1', true],
  ['2.0.0', '~1', false],
  // comparators and ands
  ['18.0.0', '>=16.8.0', true],
  ['16.7.0', '>=16.8.0', false],
  ['18.2.0', '>=17.0.0 <20.0.0', true],
  ['20.0.0', '>=17.0.0 <20.0.0', false],
  ['1.0.0', '>0.9.0', true],
  ['1.0.0', '<=1.0.0', true],
  // a space after the operator, which @react-navigation and react-native-maps both use
  ['5.7.0', '>= 3.0.0', true],
  ['2.9.0', '>= 3.0.0', false],
  ['19.2.3', '>= 18.3.1', true],
  ['18.0.0', '>= 18.3.1', false],
  ['1.5.0', '>= 1.0.0 < 2.0.0', true],
  ['2.0.0', '>= 1.0.0 < 2.0.0', false],
  ['19.0.0', '^ 19.0.0', true],
  // ors
  ['18.2.0', '^17.0.0 || ^18.0.0', true],
  ['19.0.0', '^17.0.0 || ^18.0.0', false],
  ['19.1.0', '^18 || ^19', true],
  // wildcards and x-ranges
  ['42.1.7', '*', true],
  ['1.2.9', '1.2.x', true],
  ['1.3.0', '1.2.x', false],
  ['1.9.9', '1.x', true],
  ['19.0.0', '^19', true],
  ['20.0.0', '^19', false],
  // exact
  ['19.2.3', '19.2.3', true],
  ['19.2.4', '19.2.3', false],
  // prereleases: must not leak into a stable range
  ['20.0.0-rc.1', '^19.0.0', false],
  ['19.3.0-rc.1', '>=19.0.0', false],
  ['19.3.0-rc.2', '>=19.3.0-rc.1', true],
];

for (const [version, range, expected] of cases) {
  const got = satisfies(version, range);
  ok(`${version} ${expected ? 'satisfies' : 'does not satisfy'} ${range}`, got === expected);
  if (semver) {
    const theirs = semver.satisfies(version, range, { includePrerelease: false });
    ok(`  ...and semver agrees on ${version} vs ${range}`, theirs === got);
  }
}

// a range we cannot parse must say so, not quietly pass
ok('an unparseable range returns null rather than true', satisfies('1.0.0', 'not-a-range') === null);
ok('a hyphen range is reported as unparsed, not guessed', satisfies('1.5.0', '1.2.3 - 2.0.0') === null);
ok('an unparseable version returns null', satisfies('next', '^1.0.0') === null);

// ── 2. our matcher vs the real thing, on every pair in this project ──────────
console.log('\n━━━ range matching, every pair in package-lock.json ━━━');

const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const packages = lock.packages || {};

function resolveFrom(fromDir, name) {
  const segments = fromDir ? fromDir.split('/') : [];
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const prefix = segments.slice(0, depth);
    if (depth > 0 && prefix[depth - 1] === 'node_modules') continue;
    const entry = packages[[...prefix, 'node_modules', name].join('/')];
    if (entry) return entry.version;
  }
  return null;
}

if (!semver) {
  console.log('  skip  semver is not installed, so the comparison against it was skipped.');
  console.log('        Run `npm install` and re-run to check our matcher against the real one.');
} else {
  let compared = 0;
  let unparsed = 0;
  const disagreements = [];

  for (const [location, entry] of Object.entries(packages)) {
    if (!entry.peerDependencies || entry.link) continue;
    for (const [peer, range] of Object.entries(entry.peerDependencies)) {
      const version = resolveFrom(location, peer);
      if (!version) continue;
      const ours = satisfies(version, range);
      if (ours === null) { unparsed += 1; continue; }
      if (!semver.validRange(range)) continue;
      compared += 1;
      const theirs = semver.satisfies(version, range, { includePrerelease: false });
      if (ours !== theirs) disagreements.push(`${location} peer ${peer}@${range} vs ${version}: ours=${ours} semver=${theirs}`);
    }
  }

  ok(`agreed with semver on all ${compared} real range/version pairs`, disagreements.length === 0);
  for (const d of disagreements.slice(0, 10)) console.log(`       ${d}`);
  console.log(`       (${unparsed} range${unparsed === 1 ? '' : 's'} our matcher declined to judge)`);
  ok('the vast majority of real ranges are understood', compared > 0 && unparsed <= compared * 0.1);
}

// ── 3. the lockfile as it stands, and the regression ─────────────────────────
console.log('\n━━━ the verdict on this lockfile ━━━');

const result = check();
ok('this lockfile would survive `npm ci --include=dev`', result.problems.length === 0);
for (const p of result.problems) console.log(`       ${p.what}`);
ok('it actually checked something', result.checked > 50);

// react and react-test-renderer must stay locked together: the caret that was there before
// is what let the renderer float to a version react could not satisfy.
const reactVersion = packages['node_modules/react']?.version;
const rtrVersion = packages['node_modules/react-test-renderer']?.version;
ok(`react (${reactVersion}) and react-test-renderer (${rtrVersion}) are the same version`,
  reactVersion && reactVersion === rtrVersion);

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const rtrRange = pkg.devDependencies?.['react-test-renderer'];
ok(`react-test-renderer is pinned exactly (${rtrRange}), not a floating range`,
  rtrRange && /^\d+\.\d+\.\d+$/.test(rtrRange));

// The regression itself: inject the broken pair and confirm it is reported.
console.log('\n━━━ the regression this check exists for ━━━');
ok('react-test-renderer@19.3.0 is refused against react@19.2.3',
  satisfies('19.2.3', '^19.3.0') === false);

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(64)}`);
if (failures.length === 0) {
  console.log(`  ${passed} checks passed, 0 failed`);
} else {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'─'.repeat(64)}\n`);
process.exit(failures.length > 0 ? 1 : 0);
