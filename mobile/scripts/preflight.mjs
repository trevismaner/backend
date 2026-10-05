/**
 * Checks everything that has to be right before an app-store build.
 *
 *   npm run preflight                 check the production profile
 *   npm run preflight -- preview      check a different profile
 *
 * Why this exists: an EAS build takes several minutes and the free plan includes 15 a month
 * per platform, so a build that fails — or worse, one that succeeds and installs and then
 * cannot reach the backend — is expensive. Every check here is something that has previously
 * been wrong in this project, or something whose failure is invisible until an app is already
 * on someone's phone.
 *
 * Exits non-zero when something would produce a broken build, so it can gate a release.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as checkPeerDeps } from './checkPeerDeps.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileName = process.argv[2] || 'production';

let blockers = 0;
let warnings = 0;

const ok = (msg) => console.log(`  \u001b[32mok\u001b[0m    ${msg}`);
const warn = (msg, fix) => { warnings += 1; console.log(`  \u001b[33mwarn\u001b[0m  ${msg}${fix ? `\n          ${fix}` : ''}`); };
const bad = (msg, fix) => { blockers += 1; console.log(`  \u001b[31mBLOCK\u001b[0m ${msg}${fix ? `\n          ${fix}` : ''}`); };

const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

console.log(`\n  Pre-flight for the "${profileName}" build\n  ${'─'.repeat(52)}`);

// ── will the install even succeed? ───────────────────────────────────────────
// First thing an EAS worker does is `npm ci --include=dev`, so this is the earliest and
// cheapest way a build dies. It has already happened here once: react-test-renderer was
// declared "^19.2.3", floated to 19.3.0, and 19.3.0 wants peer react@^19.3.0 while react
// is pinned at 19.2.3 for Expo SDK 57. Nothing locally complained, because node_modules
// already existed and never re-resolved.
console.log('\n  Dependencies');
{
  const { problems, checked, unparsed } = checkPeerDeps();
  for (const p of problems) bad(p.what, p.fix);
  if (problems.length === 0) {
    ok(`${checked} peer requirement${checked === 1 ? '' : 's'} resolve — \`npm ci --include=dev\` would install`
      + `${unparsed ? ` (${unparsed} range${unparsed === 1 ? '' : 's'} not understood)` : ''}`);
  }
}

// ── app identity ─────────────────────────────────────────────────────────────
console.log('\n  App identity');
const app = readJson('app.json').expo;

const androidPackage = app.android?.package;
const iosBundle = app.ios?.bundleIdentifier;

if (!androidPackage) bad('android.package is not set — EAS refuses to build Android without it.');
else if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(androidPackage)) {
  bad(`android.package "${androidPackage}" is not a valid package name.`);
} else ok(`android.package ${androidPackage}`);

if (!iosBundle) bad('ios.bundleIdentifier is not set — EAS refuses to build iOS without it.');
else ok(`ios.bundleIdentifier ${iosBundle}`);

if (!app.version) bad('version is not set.');
else ok(`version ${app.version}`);

if (!app.android?.versionCode) warn('android.versionCode is not set.', 'Google Play rejects an upload whose versionCode is not higher than the last.');
else ok(`android.versionCode ${app.android.versionCode}`);

if (!app.ios?.buildNumber) warn('ios.buildNumber is not set.', 'App Store Connect rejects a build whose number it has seen before.');
else ok(`ios.buildNumber ${app.ios.buildNumber}`);

const projectId = app.extra?.eas?.projectId || process.env.EAS_PROJECT_ID;
if (!projectId) {
  bad('No EAS project id.', 'Run `eas init` once — it links this project to your Expo account and writes the id.');
} else ok('EAS project id present');

// ── where the app will point ─────────────────────────────────────────────────
console.log('\n  Backend');
const eas = readJson('eas.json');
const profile = eas.build?.[profileName];

if (!profile) {
  bad(`eas.json has no "${profileName}" build profile.`);
} else {
  const apiUrl = profile.env?.EXPO_PUBLIC_API_URL;

  if (!apiUrl) {
    bad(`The "${profileName}" profile sets no EXPO_PUBLIC_API_URL.`,
      'Expo inlines this at build time, and the app throws at startup without it.');
  } else if (/CHANGE-ME|example\.com|run-league-api\.onrender\.com/.test(apiUrl)) {
    bad(`EXPO_PUBLIC_API_URL is still the placeholder (${apiUrl}).`,
      'Put your own deployed backend URL in eas.json, or the build cannot reach anything.');
  } else if (profileName !== 'development' && !apiUrl.startsWith('https://')) {
    bad(`EXPO_PUBLIC_API_URL is not https (${apiUrl}).`,
      'iOS blocks plain HTTP by default, so every request fails with nothing on screen to explain it.');
  } else if (!apiUrl.endsWith('/api')) {
    warn(`EXPO_PUBLIC_API_URL does not end in /api (${apiUrl}).`, 'Every route in this app is mounted under /api.');
  } else {
    ok(`EXPO_PUBLIC_API_URL ${apiUrl}`);
  }

  // The check worth the most: is that backend actually alive, and can it reach its database?
  if (apiUrl && !/CHANGE-ME|example\.com|run-league-api\.onrender\.com/.test(apiUrl)) {
    const base = apiUrl.replace(/\/api\/?$/, '');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${base}/health/db`, { signal: controller.signal });
      clearTimeout(timer);
      const body = await response.json().catch(() => null);

      if (response.ok && body?.status === 'ok') {
        ok(`backend is up and its database is reachable (${body.database?.host ?? 'unknown host'})`);
      } else if (response.status === 503) {
        bad(`the backend is up but cannot reach its database: ${body?.error ?? 'unknown'}`,
          'Shipping now means an app that installs and then fails on every screen.');
      } else {
        bad(`${base}/health/db answered ${response.status}.`);
      }
    } catch (err) {
      bad(`could not reach ${base}/health/db — ${err.name === 'AbortError' ? 'timed out' : err.message}`,
        'A free instance that has gone to sleep takes about a minute to wake; try once more before believing this.');
    }
  }
}

// ── assets ───────────────────────────────────────────────────────────────────
console.log('\n  Assets');
for (const [field, file, needed] of [
  ['icon', app.icon, true],
  ['splash.image', app.splash?.image, false],
  ['android.adaptiveIcon.foregroundImage', app.android?.adaptiveIcon?.foregroundImage, false],
]) {
  if (!file) {
    (needed ? bad : warn)(`${field} is not set.`);
    continue;
  }
  const full = path.join(ROOT, file);
  if (!existsSync(full)) bad(`${field} points at ${file}, which does not exist.`);
  else if (statSync(full).size < 1000) warn(`${field} (${file}) is suspiciously small.`);
  else ok(`${field} ${file}`);
}

// ── things that are allowed to be missing, but should be known about ─────────
console.log('\n  Optional, but worth knowing');
const mapsKey = app.android?.config?.googleMaps?.apiKey;
if (!mapsKey || /YOUR_|REPLACE|xxx/i.test(mapsKey)) {
  warn('No Google Maps key for Android.', 'Maps render blank on Android; tracking and everything else still work. iOS uses Apple Maps and needs no key.');
} else ok('Google Maps key is set');

// Comments stripped first: the stub explains expo-notifications at length, so looking for
// the name anywhere in the file reports the opposite of the truth. What matters is whether
// the module is actually imported.
const pushSource = readFileSync(path.join(ROOT, 'src/utils/pushNotifications.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
if (!/(?:from|import\s*\()\s*['"]expo-notifications['"]/.test(pushSource)) {
  warn('Push notifications are the stub build.', 'Device push will not work. In-app notifications are unaffected. See mobile/README.md to swap in the real one.');
} else ok('Push notifications use the real implementation');

// ── a trap that silently stops app.json applying ─────────────────────────────
for (const dir of ['android', 'ios']) {
  if (existsSync(path.join(ROOT, dir))) {
    warn(`A ${dir}/ folder exists, left by \`expo prebuild\`.`,
      'While it is there EAS builds from it and ignores orientation, icon, splash, plugins and the\n          ios/android blocks in app.json — so config changes appear to do nothing. Delete it unless\n          you are deliberately managing native code by hand.');
  }
}

// ── nothing secret should be going into the build ────────────────────────────
console.log('\n  Secrets');
if (existsSync(path.join(ROOT, '.env'))) {
  warn('A .env exists in mobile/.', 'Make sure it is gitignored. Only EXPO_PUBLIC_* values reach the app anyway.');
} else ok('no stray .env in mobile/');

const easText = readFileSync(path.join(ROOT, 'eas.json'), 'utf8');
if (/sk-|AIza[0-9A-Za-z_-]{30,}|-----BEGIN/.test(easText)) {
  bad('eas.json appears to contain a real secret.', 'Use `eas env:create` instead — eas.json is committed.');
} else ok('no API keys committed in eas.json');

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n  ${'─'.repeat(52)}`);
if (blockers === 0 && warnings === 0) {
  console.log('  Ready to build.\n');
} else if (blockers === 0) {
  console.log(`  Ready to build, with ${warnings} thing${warnings === 1 ? '' : 's'} to be aware of.\n`);
} else {
  console.log(`  ${blockers} blocker${blockers === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`);
  console.log('  Fix the blockers first — a build made now would be wasted.\n');
}

process.exit(blockers > 0 ? 1 : 0);
