# Building for the App Store and Google Play

Run League's app is compiled by **EAS Build** on Expo's servers — including the iOS build,
which is why you do not need a Mac. What you do need is an Expo account, and, for the stores,
a developer account with Apple and Google.

Nothing here can be done for you in advance, for two reasons worth stating plainly:

- **A release build is signed with keys that must be yours.** The Android upload key *is* your
  app's identity on Google Play for ever — lose it and you cannot update your own app — and
  the iOS certificates belong to your Apple account. A signing key that came from somebody
  else is not a key you control.
- **The backend's address is compiled into the binary.** Expo inlines `EXPO_PUBLIC_*` at build
  time, so a build made before your API is live points at nothing and no amount of fixing the
  server afterwards will change it. Deploy the backend first — `DEPLOY.md` part 1.

---

## Before anything: `npm run preflight`

```powershell
cd mobile
npm run preflight            # checks the production profile
npm run preflight -- preview # or any other profile
```

It exits non-zero when something would waste a build. Every check is something that has
actually been wrong here, or whose failure is invisible until the app is on a phone:

- **the dependencies can actually install.** The first thing an EAS worker does is
  `npm ci --include=dev`, so this is the earliest and cheapest way a build dies — and it has
  died this way here. See below.
- package name and bundle identifier set, version numbers present
- an EAS project id exists
- `EXPO_PUBLIC_API_URL` is set, is **https**, and is not still the placeholder
- **your backend answers `/health/db`** — this is the one that matters most. A build whose API
  is up but cannot reach its database installs perfectly and then fails on every screen.
- icons and splash exist
- no API key committed in `eas.json`

Run it until it says *Ready to build*. The free Expo plan includes 15 builds a month per
platform; each one takes several minutes.

### Also run `npx expo-doctor`

```powershell
npx expo-doctor
```

EAS runs this on the worker too, and a failure there does **not** stop the build — it prints
and carries on — so it is easy to miss two real problems in a wall of green. Both of these
have already been wrong here:

- **`should NOT have additional property 'splash'`** — a top-level `splash` block in
  `app.json` is not in the SDK 57 schema. The block is then ignored, so the splash image
  silently never shows. It belongs in a `["expo-splash-screen", { … }]` plugin entry.
- **`Major version mismatches: @babel/core expected ^7.29.0 found 8.0.6`** — Metro uses
  `@babel/core` to bundle your app during the Android build. A major mismatch made npm keep
  nine separate copies of it in the tree. Pin it to the version the SDK names.

`npm run preflight` now checks installed versions against the SDK's own expected-version map,
which covers `react` and the `expo-*` packages offline. But that map does not list everything
— `@babel/core` is not in it — so `expo-doctor` remains the authoritative check. Run both.

### And the audit triage

Worth running once alongside it, though it deliberately does not gate the build:

```powershell
npm run check:audit
```

`npm audit` reports around 30 vulnerable paths in an Expo project, almost all of it build
tooling that never reaches a phone. `check:audit` triages them against the four advisories
already reviewed and **fails only on something new**, so a real one cannot hide in the noise.
`mobile/README.md` has the analysis, including which of them are in the shipped bundle — and
why **`npm audit fix --force` must not be run here** (its suggested fix is `expo@44.0.6`, a
downgrade from SDK 57 to a 2021 release).

### When a build fails on `npm ci` — `ERESOLVE`

```
npm error code ERESOLVE
npm error Conflicting peer dependency: react@19.3.0
npm ci --include=dev exited with non-zero code: 1
```

Two packages disagree about a version, and `npm ci` refuses to guess. It has happened here
once already: `react` is pinned at the version Expo SDK 57 requires, `react-test-renderer`
was declared as `"^19.2.3"`, npm floated it to `19.3.0`, and `19.3.0` wants
`peer react@^19.3.0`. Locally nothing complained, because `node_modules` already existed and
never re-resolved; on a clean worker it was fatal.

The conflict is visible in the committed `package-lock.json` the whole time, so it never needs
to cost a build again:

```powershell
cd mobile
npm run check:deps      # names the pair and what to pin — offline, instant
```

`npm run preflight` runs this first, before anything else. To fix one: pin the package whose
peer range is too new to a version that accepts what is installed, then regenerate the
lockfile and **commit it** — EAS installs from the lockfile, not from `package.json`.

```powershell
npm pkg set devDependencies.react-test-renderer="19.2.3"
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
npm ci --include=dev    # the exact command the worker runs — make sure it exits 0
```

Reach for `--legacy-peer-deps` or `--force` only as a last resort. They make the install
succeed by ignoring the conflict, which leaves two incompatible copies in the build.

---

## One-time setup

```powershell
npm install -g eas-cli
eas login                    # free Expo account
eas init                     # links the project, writes the EAS project id into app.json
```

**If you have built this project before, do not let `eas init` create a new project.** It
writes the id into `app.json`, so re-extracting the project over itself wipes the link and
the next command reports *"EAS project not configured"*. The tempting fix — a bare `eas init`
— offers to make a second project, which abandons the first one's build history and, more
importantly, its **Android keystore**. That keystore is your app's identity on Google Play
permanently. Link the existing project instead:

```powershell
eas init --id <your-project-id>        # the id is on the project page at expo.dev
```

Better still, put it somewhere a re-extract cannot reach. `app.config.js` reads
`EAS_PROJECT_ID` from the environment and the CLI resolves the id from the evaluated config,
so this links the project without touching a tracked file:

```powershell
$env:EAS_PROJECT_ID = "<your-project-id>"
```

The same applies to two other values the extract overwrites: your backend URL in `eas.json`,
and `backend\.env`. `npm run preflight` blocks on the first two, so they cannot cost you a
build.

Then put your real backend URL into **both** the `preview` and `production` profiles in
`eas.json`, replacing `https://CHANGE-ME.example.com/api`.

Keep the Google Maps key out of the repository. Create it **once per environment you build
in** — a build only sees the variables of the environment its profile names, so a key set
only for `production` is absent from a `preview` build:

```powershell
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment preview
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment production
eas env:list --environment preview        # confirm it is there
```

Without it the app builds and runs; the Android map area is simply blank. iOS uses Apple Maps
and needs no key. `npm run preflight` cannot see a key stored in EAS — it runs on your machine
and the key is injected on the worker — so its warning there is not evidence of a problem.

### A blank map with the Google logo

Worth separating two symptoms, because they mean different things:

- **Blank grey area, nothing in it** — no map view at all. Look at the app code first.
- **Blank area with the Google logo in a corner** — the Maps SDK loaded, created its surface
  and drew its own watermark. It is the *tiles* that are being refused. The key is reaching
  Google, or a key is present and invalid; either way the SDK is working and the problem is on
  the Google Cloud side of the line.

Four causes produce that second symptom identically, so guessing is slow. In rough order of
how often they are the answer:

1. **No billing account on the Google Cloud project.** Maps Platform requires one even to use
   the free monthly allowance — enabling the API is not enough on its own. Check
   *Billing* in the Cloud Console.
2. **The wrong API is enabled.** "Maps JavaScript API" is the one people enable by mistake.
   Android needs **Maps SDK for Android**, which is a different product in the library.
3. **The key's restrictions do not match the build.** If the key is restricted to an Android
   app, the package name AND the signing SHA-1 both have to match. An EAS build is signed with
   the keystore in your Expo account, whose fingerprint is **not** the one from a local debug
   build — `eas credentials` shows the right one.
4. **The key never reached the build.** `EXPO_PUBLIC_*` and the Maps key are baked in at build
   time, so a variable created *after* a build started is not in that build.
   `eas env:list --environment preview` shows what exists now; compare its timestamps against
   the build's.

**Two checks that need no tooling.** First, in the Cloud Console open *APIs & Services →
Maps SDK for Android → Metrics*:

- **No requests at all** — the app is not reaching Google. That is cause 2 or 4.
- **Requests, with errors** — the key is arriving and being refused. That is cause 1 or 3.

Second, if you are on cause 3, you need the fingerprint the build actually used:

```powershell
eas credentials                     # Android -> the keystore -> its SHA-1
```

**The decisive check** is the device log, because the Maps SDK says exactly what is wrong and
names the package and fingerprint it saw — which is precisely what you paste into the key's
restrictions. It needs Android platform-tools (a small standalone download; Android Studio is
not required) and USB debugging on:

```powershell
adb logcat | Select-String -Pattern "Google Maps|Authorization|API key|Maps SDK"
```

Then open the run screen in the app. What you are looking for:

| Log line | Means |
| --- | --- |
| `API key not found` / mentions `com.google.android.geo.API_KEY` | Cause 4 — no key in the manifest |
| `Authorization failure` plus `Android Application (<fingerprint>;<package>) is not authorized` | Cause 3 — copy that fingerprint and package straight into the key's restrictions |
| Mentions the API not being enabled for the project | Cause 2 |
| Mentions billing | Cause 1 |

While you are sorting this out: nothing else in the app depends on it. Tracking, distance,
route recording, the leaderboard and the planner all work with the map area blank.

---

## Android

### The build you probably want first

```powershell
eas build --platform android --profile preview
```

Produces an **`.apk`** you can download and send to anyone — a marker, a tester, your own
phone. No Google Play account, no $25, no review queue. The recipient enables "install from
unknown sources" and opens it.

**This is also the only way to see background GPS and device push**, neither of which work in
Expo Go. If you have been judging the app from Expo Go, build this before you judge it.

### For Google Play

```powershell
eas build --platform android --profile production   # .aab, the format Play accepts
eas submit --platform android --latest
```

The first build asks whether EAS should generate an upload keystore. Say yes and it is stored
in your Expo account; back it up (`eas credentials`) — losing it means you cannot update your
own listing.

`versionCode` must increase on every upload. `autoIncrement: true` on the production profile
handles that for you.

---

## iOS

EAS compiles iOS on its own Mac workers, so **a Mac of your own is optional**. What it costs
depends entirely on where the build has to end up:

| What you want | Apple Developer Program ($99/yr)? | Mac needed? |
| --- | --- | --- |
| Prove it compiles for iOS | **No** — simulator builds are not code-signed | No |
| Run it in the iOS Simulator | No | **Yes** — the Simulator is macOS-only |
| Install on a real iPhone | **Yes** | No |
| TestFlight / App Store | **Yes** | No |

So the free thing you can do today is a **simulator build**, which needs no Apple account at
all and proves the project builds for iOS:

```powershell
eas build --platform ios --profile preview
```

That produces a `.tar.gz` containing a `.app`, runnable only in the iOS Simulator on a Mac. If
you have no Mac it is not something you can launch — but it is still a genuine iOS build, and
for coursework "builds for both platforms" is often the claim that matters. It uses one of your
15 monthly iOS build credits, which are separate from Android's.

```powershell
eas build --platform ios --profile production
eas submit --platform ios --latest
```

The first build walks you through signing: log in with your Apple ID and let EAS create the
distribution certificate and provisioning profile. Everything from there is TestFlight and App
Store Connect, which happen in a browser.

`buildNumber` must be one App Store Connect has not seen; `autoIncrement` handles it.

### Onto a real iPhone, without the store

This needs the $99 membership — ad-hoc provisioning requires a developer account, so there is
no free route onto a physical device.

Note that `--profile preview` will **not** do it: that profile sets `ios.simulator: true`, so
it builds for the Simulator however many devices you have registered. Use the
**`preview-device`** profile, which exists for this and sets `simulator: false`:

```powershell
eas device:create                                    # register the iPhone's UDID
eas build --platform ios --profile preview-device
```

### What App Store review will ask about

This app requests location "always", which is scrutinised. Have an answer ready, and it is a
true one: a run has to keep being recorded when the phone is locked and in a pocket, which is
most of a run. The permission strings in `app.json` already say so, the Android build shows a
notification the whole time it is recording, and `showsBackgroundLocationIndicator` is on for
iOS.

---

## Both at once

```powershell
eas build --platform all --profile production
```

---

## After a build

Take the `.apk` or install from TestFlight and check the things that only a real build can do:

- [ ] Sign in — proves the compiled API URL is right
- [ ] Log a run, lock the phone, keep walking, unlock — the distance should have kept climbing
- [ ] Force-close the app mid-run, reopen it — the run should be offered back
- [ ] Generate a fitness plan
- [ ] Open the leaderboard
- [ ] Check the map draws (Android needs the Maps key)

If sign-in fails but the backend is healthy in a browser, the build has the wrong
`EXPO_PUBLIC_API_URL` and needs rebuilding — it cannot be fixed on the server.

---

## Updating without rebuilding

Changes to JavaScript — a screen, a controller, wording — can go out over the air:

```powershell
eas update --branch production --message "Fix the plan screen"
```

Changes to native configuration cannot: new permissions, a different `app.json`, an added
native module, a new `EXPO_PUBLIC_*` value. Those need a fresh build.
