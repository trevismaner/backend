/**
 * Replays npm's peer-dependency resolution against package-lock.json, offline.
 *
 *   node scripts/checkPeerDeps.mjs
 *
 * Why this exists: EAS Build starts with `npm ci --include=dev` on its worker. `npm ci`
 * installs strictly from the lockfile AND validates peer dependencies, so a lockfile
 * holding an impossible combination fails the build in its first thirty seconds — after
 * the queue wait, and against your monthly build allowance.
 *
 * This project has already lost a build to exactly that. `react` is pinned at the version
 * Expo SDK 57 requires, `react-test-renderer` was declared as "^19.2.3", npm floated it to
 * 19.3.0, and 19.3.0 declares `peer react@^19.3.0`. Locally there was already a
 * node_modules, so nothing re-resolved and nothing complained. On a clean worker it was
 * fatal:
 *
 *     npm error Conflicting peer dependency: react@19.3.0
 *     npm ci --include=dev exited with non-zero code: 1
 *
 * The lesson is that the failure is visible in the committed lockfile the whole time. So
 * read it: for every package that declares a peer, resolve that peer the way Node would
 * (walk up the node_modules chain) and check the locked version satisfies the range.
 *
 * Runs in milliseconds and needs no network and no node_modules of its own, so it is cheap
 * enough to gate every build.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── range matching ───────────────────────────────────────────────────────────
 * Deliberately not using the `semver` package. It is only ever present in this project
 * transitively, so a check that imported it would quietly stop working whenever it ran
 * before `npm install` — printing "nothing would fail" without having looked. A green
 * result that did no work is the worst outcome here, so this does its own matching and
 * counts anything it cannot parse as unchecked rather than as passing.
 *
 * Verified against the real semver package across every range in this lockfile; see
 * tests/peer_deps.test.mjs.
 */

const PARTS = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

function parse(version) {
  const m = PARTS.exec(String(version).trim().replace(/^v/, ''));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

function comparePre(a, b) {
  // No prerelease outranks any prerelease (1.0.0 > 1.0.0-rc.1).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]) ? +a[i] : null;
    const nb = /^\d+$/.test(b[i]) ? +b[i] : null;
    if (na !== null && nb !== null) { if (na !== nb) return na < nb ? -1 : 1; continue; }
    if (na !== null) return -1;          // numeric identifiers rank below alphanumeric
    if (nb !== null) return 1;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function cmp(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePre(a.pre, b.pre);
}

/** Expand one comparator-or-shorthand into explicit {op, version} bounds. */
function comparators(token) {
  const t = token.trim();
  if (t === '' || t === '*' || t === 'x' || t === 'X') return [];           // matches anything

  // ^1.2.3 / ~1.2.3 — the two that cover almost every peer range in practice.
  let m = /^([\^~])\s*(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(t);
  if (m) {
    const [, kind, majStr, minStr, patStr, pre] = m;
    const major = +majStr;
    const minorGiven = minStr !== undefined && !/[xX*]/.test(minStr);
    const patchGiven = patStr !== undefined && !/[xX*]/.test(patStr);
    const minor = minorGiven ? +minStr : 0;
    const patch = patchGiven ? +patStr : 0;
    const lower = { major, minor, patch, pre: pre ? pre.split('.') : [] };

    let upper;
    if (kind === '^') {
      // Caret allows changes that do not modify the left-most NON-ZERO component, so a
      // 0.x version is far tighter than it looks:
      //   ^1.2.3 -> <2.0.0     ^0.2.3 -> <0.3.0     ^0.0.2 -> <0.0.3
      //   ^0.0   -> <0.1.0     ^0     -> <1.0.0
      if (major !== 0) upper = { major: major + 1, minor: 0, patch: 0, pre: [] };
      else if (minor !== 0) upper = { major: 0, minor: minor + 1, patch: 0, pre: [] };
      else if (patchGiven) upper = { major: 0, minor: 0, patch: patch + 1, pre: [] };
      else if (minorGiven) upper = { major: 0, minor: 1, patch: 0, pre: [] };
      else upper = { major: 1, minor: 0, patch: 0, pre: [] };
    } else {
      // Tilde allows patch-level changes if a minor is given, minor-level if it is not.
      upper = minorGiven
        ? { major, minor: minor + 1, patch: 0, pre: [] }
        : { major: major + 1, minor: 0, patch: 0, pre: [] };
    }
    return [{ op: '>=', v: lower }, { op: '<', v: upper }];
  }

  // >= 1.2.3, > 1.2, <= 1, < 2.0.0, = 1.2.3, 1.2.3, 1.2.x, 1.x
  m = /^(>=|<=|>|<|=|)\s*(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(t);
  if (m) {
    const [, opRaw, majStr, minStr, patStr, pre] = m;
    const op = opRaw || '=';
    const major = +majStr;
    const minorGiven = minStr !== undefined && !/[xX*]/.test(minStr);
    const patchGiven = patStr !== undefined && !/[xX*]/.test(patStr);
    const minor = minorGiven ? +minStr : 0;
    const patch = patchGiven ? +patStr : 0;
    const v = { major, minor, patch, pre: pre ? pre.split('.') : [] };

    if (op === '=' && (!minorGiven || !patchGiven)) {
      // An x-range equality is a window: 1.2.x -> >=1.2.0 <1.3.0
      const upper = minorGiven
        ? { major, minor: minor + 1, patch: 0, pre: [] }
        : { major: major + 1, minor: 0, patch: 0, pre: [] };
      return [{ op: '>=', v }, { op: '<', v: upper }];
    }
    return [{ op, v }];
  }

  return null;   // a shape we do not understand — caller treats the range as unchecked
}

/**
 * Does `version` satisfy `range`? Returns null when the range cannot be parsed, so the
 * caller can count it as unchecked instead of silently passing it.
 */
export function satisfies(version, range) {
  const v = parse(version);
  if (!v) return null;

  // ">= 3.0.0" is written with a space in the wild (several @react-navigation packages and
  // react-native-maps do it), so glue operators to their version before splitting on space.
  const normalised = String(range).replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');

  for (const alternative of normalised.split('||')) {
    const tokens = alternative.trim().split(/\s+/).filter(Boolean);
    // Hyphen ranges ("1.2.3 - 2.0.0") are rare in peer deps and not handled.
    if (tokens.includes('-')) return null;

    let all = [];
    let parsed = true;
    for (const token of tokens.length ? tokens : ['*']) {
      const cs = comparators(token);
      if (cs === null) { parsed = false; break; }
      all = all.concat(cs);
    }
    if (!parsed) return null;

    const met = all.every(({ op, v: bound }) => {
      const c = cmp(v, bound);
      // A prerelease only satisfies a range when a bound names the same [major,minor,patch].
      if (v.pre.length && !all.some(({ v: b }) => b.pre.length
        && b.major === v.major && b.minor === v.minor && b.patch === v.patch)) return false;
      switch (op) {
        case '>=': return c >= 0;
        case '>':  return c > 0;
        case '<=': return c <= 0;
        case '<':  return c < 0;
        default:   return c === 0;
      }
    });
    if (met) return true;
  }
  return false;
}

/** The version the lockfile installs for `name`, as resolved from inside `fromDir`. */
function resolveFrom(packages, fromDir, name) {
  // node_modules/a/node_modules/b  ->  try b's own node_modules, then a's, then the root.
  const segments = fromDir ? fromDir.split('/') : [];
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const prefix = segments.slice(0, depth);
    // Only consider real node_modules boundaries.
    if (depth > 0 && prefix[depth - 1] === 'node_modules') continue;
    const candidate = [...prefix, 'node_modules', name].join('/');
    const entry = packages[candidate];
    if (entry) {
      if (entry.link && entry.resolved) {
        const target = packages[entry.resolved];
        if (target) return { version: target.version, at: entry.resolved };
      }
      return { version: entry.version, at: candidate };
    }
  }
  return null;
}

export function check() {
  const problems = [];
  const notes = [];

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (!existsSync(lockPath)) {
    problems.push({
      what: 'There is no package-lock.json.',
      fix: '`npm ci` refuses to run without one, so the EAS build cannot start. Run `npm install` and commit the lockfile.',
    });
    return { problems, notes, checked: 0, unparsed: 0 };
  }

  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packages = lock.packages || {};

  // ── 1. is the lockfile still in step with package.json? ────────────────────
  // `npm ci` errors out rather than repairing a drifted lockfile, so this is also fatal.
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [name, range] of Object.entries(declared)) {
    if (/^(?:file|link|git|github|https?|npm):/.test(range) || range.startsWith('workspace:')) continue;
    const entry = packages[`node_modules/${name}`];
    if (!entry) {
      problems.push({
        what: `package.json wants ${name}, but the lockfile has no entry for it.`,
        fix: 'The lockfile is out of date. Run `npm install` and commit the result.',
      });
      continue;
    }
    if (entry.version && satisfies(entry.version, range) === false) {
      problems.push({
        what: `${name}: package.json wants ${range}, the lockfile pins ${entry.version}.`,
        fix: 'The lockfile is out of date. Run `npm install` and commit the result.',
      });
    }
  }

  // ── 2. the one that cost a build: unsatisfiable peers ──────────────────────
  let checked = 0;
  let unparsed = 0;
  for (const [location, entry] of Object.entries(packages)) {
    if (!entry.peerDependencies || entry.link) continue;
    const optional = entry.peerDependenciesMeta || {};
    const self = location.replace(/^node_modules\//, '').replace(/\/node_modules\//g, ' > ') || pkg.name;

    for (const [peer, range] of Object.entries(entry.peerDependencies)) {
      const isOptional = Boolean(optional[peer]?.optional);
      const found = resolveFrom(packages, location, peer);

      if (!found) {
        // An absent optional peer is exactly what "optional" means — nothing to say. A
        // non-optional one npm installs itself, so it is only worth a note.
        if (!isOptional) notes.push(`${self} wants peer ${peer}@${range}, which is not in the lockfile.`);
        continue;
      }
      // An optional peer that IS installed still has to agree: npm reports it as
      // "peerOptional" in the same ERESOLVE report that fails the install.

      const verdict = found.version ? satisfies(found.version, range) : null;
      if (verdict === null) { unparsed += 1; continue; }
      checked += 1;
      if (verdict === false) {
        problems.push({
          what: `${self} needs peer ${peer}@${range}, but the lockfile installs ${peer}@${found.version}.`,
          fix: `npm ci stops with "Conflicting peer dependency". Pin ${self.split(' > ').pop()} to a version `
             + `whose peer range accepts ${peer}@${found.version}, or move ${peer} to a version this one accepts.`,
        });
      }
    }
  }

  return { problems, notes, checked, unparsed };
}

// Standalone run: print and set the exit code.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, notes, checked, unparsed } = check();
  console.log(`\n  Checked ${checked} peer requirement${checked === 1 ? '' : 's'} in package-lock.json`
    + `${unparsed ? ` (${unparsed} range${unparsed === 1 ? '' : 's'} not understood, so not checked)` : ''}\n`);
  for (const note of notes) console.log(`  note   ${note}`);
  for (const p of problems) console.log(`  BLOCK  ${p.what}\n         ${p.fix}`);
  if (problems.length === 0) {
    console.log('  Nothing here would fail `npm ci --include=dev`.\n');
  } else {
    console.log(`\n  ${problems.length} problem${problems.length === 1 ? '' : 's'}. An EAS build would fail during install.\n`);
  }
  process.exit(problems.length > 0 ? 1 : 0);
}
