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

Then put your real backend URL into **both** the `preview` and `production` profiles in
`eas.json`, replacing `https://CHANGE-ME.example.com/api`.

Keep the Google Maps key out of the repository:

```powershell
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment production
```

Without it the app builds and runs; the Android map area is simply blank. iOS uses Apple Maps
and needs no key.

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

Needs an **Apple Developer Program** membership ($99/year). EAS compiles on its own Mac
workers, so a Mac of your own is optional.

```powershell
eas build --platform ios --profile production
eas submit --platform ios --latest
```

The first build walks you through signing: log in with your Apple ID and let EAS create the
distribution certificate and provisioning profile. Everything from there is TestFlight and App
Store Connect, which happen in a browser.

`buildNumber` must be one App Store Connect has not seen; `autoIncrement` handles it.

The `preview` profile's iOS build is a **simulator** build, which only runs on a Mac. To put a
build on a real iPhone without the store, register the device first:

```powershell
eas device:create
eas build --platform ios --profile preview
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
