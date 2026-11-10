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
import { check as checkPeerDeps, satisfies } from './checkPeerDeps.mjs';

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

  // Does what is installed match what this Expo SDK expects? The SDK ships its own expected
  // version map, so this works offline. It is the same class of bug as the peer conflict
  // above: a dependency drifting to a version the SDK was not built against. `@babel/core`
  // once reached 8.x here while the SDK wanted ^7.29.0, which made npm keep nine separate
  // copies of it in the tree.
  //
  // This map covers the native modules and react, not every package, so it is a floor and
  // not a ceiling — `npx expo-doctor` is the authoritative check and catches more.
  try {
    const expected = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/expo/bundledNativeModules.json'), 'utf8'));
    const pkgJson = readJson('package.json');
    const declared = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
    const wrong = [];
    let compared = 0;

    for (const name of Object.keys(declared)) {
      const want = expected[name];
      if (!want) continue;
      let installed;
      try {
        installed = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
      } catch { continue; }
      compared += 1;
      if (satisfies(installed, want) === false) wrong.push({ name, installed, want });
    }

    for (const w of wrong) {
      bad(`${w.name} is ${w.installed}, but Expo SDK ${pkgJson.dependencies?.expo ?? ''} expects ${w.want}.`,
        'Run `npx expo install --check` to line these up. A major mismatch here can break the\n'
        + '          release bundle inside the Android build, where the error is far less obvious.');
    }
    if (wrong.length === 0) ok(`${compared} package${compared === 1 ? '' : 's'} match the versions this Expo SDK expects`);
  } catch {
    warn('Could not read Expo\'s expected-version map.', 'Run `npm install` first, then `npx expo-doctor`.');
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

/**
 * The project id lives in app.json's extra.eas.projectId, written by `eas init`. That makes
 * it a casualty of re-extracting the project over itself, which is how it usually goes
 * missing — not because it was never set.
 *
 * Which matters, because the obvious response is wrong: a bare `eas init` offers to create a
 * NEW project, orphaning the build history and the Android keystore of the old one. The
 * keystore is the app's identity on Google Play for good, so losing track of it is the
 * expensive mistake here.
 *
 * app.config.js also reads EAS_PROJECT_ID from the environment, and the CLI resolves the id
 * from the evaluated config — so setting that variable links the project in a way that
 * survives the file being overwritten.
 */
const projectId = app.extra?.eas?.projectId || process.env.EAS_PROJECT_ID;
if (!projectId) {
  bad('No EAS project id.',
    'If this project has never been built: `eas init` and pick an account.\n'
    + '          If it HAS been built before, do not let `eas init` create a new project — that\n'
    + '          abandons the existing keystore and build history. Link the existing one instead:\n'
    + '              eas init --id <your-project-id>\n'
    + '          The id is on the project page at expo.dev. To make it survive re-extracting the\n'
    + '          project, set it in your environment instead of relying on app.json:\n'
    + '              $env:EAS_PROJECT_ID = "<your-project-id>"');
} else {
  ok(`EAS project id present${app.extra?.eas?.projectId ? '' : ' (from EAS_PROJECT_ID)'}`);
}

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
  //
  // Two attempts, and the second is generous on purpose. A free Render instance spins down
  // after 15 minutes idle and takes around a minute to come back — so a single short timeout
  // reports "could not reach" for a backend that is merely asleep and perfectly healthy.
  // This blocks the build, which makes a spurious failure expensive: the honest answer is
  // not available until the instance has actually had time to wake.
  if (apiUrl && !/CHANGE-ME|example\.com|run-league-api\.onrender\.com/.test(apiUrl)) {
    const base = apiUrl.replace(/\/api\/?$/, '');

    const attempt = async (ms) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        const response = await fetch(`${base}/health/db`, { signal: controller.signal });
        const body = await response.json().catch(() => null);
        return { response, body };
      } finally {
        clearTimeout(timer);
      }
    };

    const report = ({ response, body }) => {
      if (response.ok && body?.status === 'ok') {
        ok(`backend is up and its database is reachable (${body.database?.host ?? 'unknown host'})`);
      } else if (response.status === 503) {
        bad(`the backend is up but cannot reach its database: ${body?.error ?? 'unknown'}`,
          'Shipping now means an app that installs and then fails on every screen.');
      } else {
        bad(`${base}/health/db answered ${response.status}.`);
      }
    };

    try {
      report(await attempt(20000));
    } catch (first) {
      // Nothing in 20 seconds. Most likely asleep rather than broken, so say what is
      // happening and wait properly rather than declaring failure.
      console.log(`  \u001b[33m...\u001b[0m   no answer in 20s — a sleeping free instance takes about a minute`);
      console.log('          to wake, so giving it longer before calling this a failure');
      try {
        report(await attempt(75000));
      } catch (second) {
        const why = second.name === 'AbortError' ? 'no answer in 95 seconds total' : second.message;
        bad(`could not reach ${base}/health/db — ${why}`,
          'Check the service is deployed and running on its dashboard, and that the URL is right.\n'
          + `          Opening ${base}/health in a browser is the quickest way to tell the difference\n`
          + '          between a slow wake and a service that is actually down.');
        void first;
      }
    }
  }
}

// ── assets ───────────────────────────────────────────────────────────────────
console.log('\n  Assets');

// A top-level `splash` block is not in the SDK 57 config schema — `expo doctor` rejects it
// with "should NOT have additional property 'splash'" and the block is then ignored, so the
// splash image silently does not apply. Splash is configured through the
// expo-splash-screen plugin instead, so that is where to look for it.
const splashPlugin = (app.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
const splashImage = splashPlugin?.[1]?.image;
if (app.splash) {
  bad('app.json has a top-level "splash" block, which SDK 57 does not accept.',
    'expo doctor fails on it and the block is ignored, so the splash never shows. Move it to\n'
    + '          a ["expo-splash-screen", { image, resizeMode, backgroundColor }] entry in "plugins".');
}

for (const [field, file, needed] of [
  ['icon', app.icon, true],
  ['expo-splash-screen image', splashImage, false],
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
/**
 * The Maps key deliberately is not committed: `app.config.js` reads GOOGLE_MAPS_API_KEY from
 * the environment and falls back to the placeholder in app.json. That means this check can
 * see a key set in *this* shell, but not one stored in EAS — the build worker has it and we
 * do not. So the wording has to say which it is, or a correctly configured project reads as
 * broken every time preflight runs.
 */
const mapsKeyFromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim();
const mapsKeyInAppJson = app.android?.config?.googleMaps?.apiKey;
const placeholder = (k) => !k || /YOUR_|REPLACE|xxx|CHANGE/i.test(k);

if (mapsKeyFromEnv && !placeholder(mapsKeyFromEnv)) {
  ok('Google Maps key present in this environment');
} else if (!placeholder(mapsKeyInAppJson)) {
  ok('Google Maps key is set in app.json');
} else {
  warn('No Google Maps key visible here.',
    'Maps render blank on Android; tracking, distance and everything else still work. iOS uses\n'
    + '          Apple Maps and needs no key. This check cannot see a key stored in EAS, so if you ran\n'
    + '          `eas env:create --name GOOGLE_MAPS_API_KEY`, confirm it covers the environment of the\n'
    + '          profile you are building: `eas env:list --environment ' + profileName + '`.');
}

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
