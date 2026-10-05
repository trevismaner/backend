/**
 * Triages `npm audit` against a list of advisories that have been looked at and accepted.
 *
 *   npm run check:audit
 *
 * Why this exists rather than just reading `npm audit`: in an Expo/React Native project the
 * audit reports the whole build toolchain — Metro, the Expo CLI, the Xcode project writer —
 * most of which never reaches a phone. The result is a permanent wall of "17 high severity"
 * that means almost nothing, and the danger of a wall like that is not the noise, it is that
 * a genuine advisory arriving later looks exactly like the rest of it.
 *
 * So each known advisory is recorded below with why it is accepted, and anything NOT on that
 * list fails this check. "Accepted" is a decision with a date and a reason, not an omission.
 *
 * Never run `npm audit fix --force` here. npm's suggested "fix" for three of these is
 * expo@44.0.6 — a downgrade from SDK 57 to a 2021 release — because that is the only tree
 * where the advisory does not appear. It would destroy the project. The fourth suggests
 * @react-navigation/native@7, a major upgrade that breaks this app's navigators.
 *
 * Re-check the accepted list when upgrading the Expo SDK: a patched version may exist by
 * then, and `npm view <pkg> version` against the advisory's range is how you tell.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Advisories that have been investigated and accepted.
 *
 * `shipped` is the finding that matters most, and it is not a guess: it comes from building a
 * real production bundle with `npx expo export --source-maps` and reading the `sources` list
 * out of the source map, which is every module Metro actually put in the bundle.
 */
const ACCEPTED = {
  'GHSA-vfj7-8cjw-p6xm': {
    pkg: 'braces',
    reviewed: '2026-10-06',
    shipped: false,
    why: 'Build tooling only — braces comes in via micromatch -> metro-file-map -> Metro, the '
       + 'bundler. Confirmed absent from a production bundle. No patched version exists: the '
       + 'advisory covers <=3.0.3 and 3.0.3 is the latest published release, so there is '
       + 'nothing to upgrade to and no override that helps.',
  },
  'GHSA-86w9-cpqp-85rv': {
    pkg: 'node-forge',
    reviewed: '2026-10-06',
    shipped: false,
    why: 'Build tooling only — reached through @expo/code-signing-certificates in the Expo '
       + 'CLI, used for signing expo-updates manifests, not by the app. Confirmed absent from '
       + 'a production bundle. No patched version exists: the advisory covers <=1.4.0 and '
       + '1.4.0 is the latest published release.',
  },
  'GHSA-w5hq-g745-h8pq': {
    pkg: 'uuid',
    reviewed: '2026-10-06',
    shipped: false,
    why: 'Build tooling only — uuid 7 arrives via the `xcode` package inside '
       + '@expo/config-plugins, which writes the iOS project during prebuild. Confirmed absent '
       + 'from a production bundle. A patched version does exist (>=11.1.1), but overriding '
       + 'uuid across four majors underneath the thing that generates the Xcode project risks '
       + 'breaking the iOS build for no runtime gain. The flaw also needs v3/v5/v6 called with '
       + 'an explicit `buf` argument, which this chain does not do.',
  },
  'GHSA-vcc3-ghjq-m6fr': {
    pkg: 'decode-uri-component',
    reviewed: '2026-10-06',
    shipped: true,
    why: 'This one IS in the bundle, via query-string inside @react-navigation/core. It is '
       + 'unreachable in this app: query-string is only used by getStateFromPath and '
       + 'getPathFromState, which run only when NavigationContainer is given a `linking` prop, '
       + 'and it is given only `theme`. The sole non-vulnerable release, 0.5.0, is ESM-only '
       + '("type": "module", default export), while query-string loads it with CommonJS '
       + 'require() and calls the result directly — so an override makes that call throw '
       + '"decodeComponent is not a function". Silencing the audit that way would plant a '
       + 'crash that only appears the day deep linking is added. REVISIT when moving to '
       + 'React Navigation v7, which is the real fix, or before enabling deep links.',
  },
};

let blockers = 0;
let accepted = 0;
const green = (s) => `\u001b[32m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const yellow = (s) => `\u001b[33m${s}\u001b[0m`;

function runAudit() {
  try {
    // npm audit exits non-zero when it finds anything, so the output is what matters.
    return execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

/** If a production bundle has been exported, use its source map as ground truth. */
function bundledModules() {
  for (const dir of ['dist', 'build']) {
    const base = path.join(ROOT, dir, '_expo', 'static', 'js');
    if (!existsSync(base)) continue;
    for (const platform of readdirSync(base)) {
      const pdir = path.join(base, platform);
      for (const file of readdirSync(pdir)) {
        if (!file.endsWith('.map')) continue;
        try {
          const map = JSON.parse(readFileSync(path.join(pdir, file), 'utf8'));
          return (map.sources || []).filter(Boolean);
        } catch { /* unreadable map: fall through */ }
      }
    }
  }
  return null;
}

console.log('\n  npm audit triage\n  ' + '─'.repeat(56));

const report = JSON.parse(runAudit());
const counts = report.metadata?.vulnerabilities ?? {};
const found = new Map();

for (const [name, entry] of Object.entries(report.vulnerabilities || {})) {
  for (const adv of (entry.via || []).filter((v) => typeof v === 'object')) {
    const id = (adv.url || '').split('/').pop();
    if (id) found.set(id, { name, severity: adv.severity, title: adv.title, range: adv.range, fix: entry.fixAvailable });
  }
}

console.log(`\n  ${found.size} advisor${found.size === 1 ? 'y' : 'ies'} across `
  + `${counts.total ?? 0} dependency path${(counts.total ?? 0) === 1 ? '' : 's'}`
  + ` (${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.critical ?? 0} critical)\n`);

for (const [id, info] of found) {
  const note = ACCEPTED[id];
  if (!note) {
    blockers += 1;
    console.log(`  ${red('NEW')}    ${info.name} — ${info.severity}`);
    console.log(`         ${info.title}`);
    console.log(`         vulnerable: ${info.range}`);
    if (info.fix && typeof info.fix === 'object') {
      console.log(`         npm suggests ${info.fix.name}@${info.fix.version}`
        + `${info.fix.isSemVerMajor ? ' (a MAJOR change — check what it would downgrade)' : ''}`);
    }
    console.log(`         https://github.com/advisories/${id}`);
    console.log(`         Decide on this one, then add it to ACCEPTED in scripts/checkAudit.mjs`
      + ` with a reason — or fix it.\n`);
    continue;
  }
  accepted += 1;
  const where = note.shipped ? yellow('in the bundle') : 'build-time only';
  console.log(`  ${green('ok')}     ${info.name} — ${info.severity}, ${where}, reviewed ${note.reviewed}`);
}

// An accepted advisory is only accepted on the facts recorded with it. If a bundle has been
// exported, check that "build-time only" is still true.
const sources = bundledModules();
if (sources) {
  console.log(`\n  Checked against an exported bundle (${sources.length} modules).`);
  for (const [id, note] of Object.entries(ACCEPTED)) {
    if (!found.has(id)) continue;
    const inBundle = sources.some((s) => s.includes(`node_modules/${note.pkg}/`));
    if (inBundle && !note.shipped) {
      blockers += 1;
      console.log(`  ${red('CHANGED')} ${note.pkg} is now in the shipped bundle, but is accepted as build-time only.`);
      console.log(`          Re-assess ${id} — the reason it was accepted no longer holds.`);
    }
  }
} else {
  console.log('\n  note   No exported bundle found, so "build-time only" was taken from the recorded');
  console.log('         review rather than re-checked. `npx expo export --source-maps` regenerates it.');
}

console.log('\n  ' + '─'.repeat(56));
if (blockers === 0) {
  console.log(`  ${accepted} known advisor${accepted === 1 ? 'y' : 'ies'}, all reviewed and accepted. Nothing new.\n`);
} else {
  console.log(`  ${blockers} advisor${blockers === 1 ? 'y' : 'ies'} needing a decision.\n`);
}
process.exit(blockers > 0 ? 1 : 0);
