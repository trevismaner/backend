# Run League Mobile

React Native + Expo app for Run League. Follows the same BCE (Boundary-Control-Entity)
architecture as the backend.

## Folder Structure

```
mobile/
├── App.js
├── app.json
├── src/
│   ├── boundary/     # Screens — the "B" in BCE, one file per screen
│   ├── control/       # Business logic — the "C" in BCE, one controller file per use case
│   ├── entities/       # Client-side data classes — the "E" in BCE, call the API directly
│   ├── api/              # client.js — the low-level fetch wrapper entities call into
│   ├── components/         # AppUI.js — the shared Screen, Card, Field, Button, BottomNav
│   ├── context/              # AuthContext (session state), ThemeContext (light/dark)
│   ├── navigation/             # AppNavigator — role-gated stack navigation
│   ├── theme/                    # colors, typography, spacing tokens
│   └── utils/                      # geo.js (distance, duration, route thinning),
│                                   # pushNotifications.js
└── tests/            # see "Tests" below, and tests/README.md
```

Each user story gets its own controller file in `control/` (e.g. `LoginController.js`,
`CreateRunController.js`, `UpdateRunNameController.js`), matching the same pattern used
in the backend. A controller validates input, calls the relevant entity, and returns a
consistent `{ success, field, message, data }` shape. Screens in `boundary/` call
controllers directly — they never call `entities/` or `api/` themselves.


## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Point the app at your backend**

   Set `EXPO_PUBLIC_API_URL` rather than editing the source:

   ```powershell
   # PowerShell — stays set for the rest of this terminal window
   $env:EXPO_PUBLIC_API_URL = "http://192.168.1.42:3000/api"
   ```

   ```bash
   # bash / zsh — prefix the start command instead
   export EXPO_PUBLIC_API_URL=http://192.168.1.42:3000/api
   ```

   Expo inlines `EXPO_PUBLIC_*` at build time, so restart with `-c` after changing it. If it is
   unset, `src/api/client.js` falls back to `http://192.168.1.53:3000/api` — a hardcoded address
   that will not resolve on your network, which looks like the backend being down. Set it.

   Use:
   - iOS simulator: `http://localhost:3000/api` works as-is
   - Android emulator: use `http://10.0.2.2:3000/api`
   - Physical device: use your computer's local network IP, e.g. `http://192.168.1.x:3000/api`
     (make sure your phone and computer are on the same Wi-Fi network). Find it with
     `ipconfig` on Windows — the IPv4 address of your Wi-Fi adapter.

3. **Make sure the backend is running first** (see `../backend/README.md`) — the app is a
   client; with no server reachable, every screen loads empty and sign-in fails.

4. **Start the app**
   ```bash
   npx expo start
   ```
   **Scan the QR code with Expo Go** on your phone. Pressing `a` launches an Android emulator,
   which needs Android Studio and the Android SDK on `PATH` — without them it fails with
   "Failed to resolve the Android SDK path" / "`adb` is not recognized". Scanning needs neither.
   Press `r` to reload, `-c` on start to clear Metro's cache.

## Push notifications and Expo Go

Device-level push is **off**, and the app runs fine without it. Nothing needs setting up —
`npx expo start` is all you need.

Expo removed Android remote-push support from Expo Go in SDK 53. Since then, loading
`expo-notifications` inside Expo Go throws while the module initialises — it calls
`addPushTokenListener`, which raises `warnOfExpoGoPushUsage` — and because that happens during
module evaluation it crashes the app with `[runtime not ready]` before React ever mounts.

An environment flag is not enough to avoid this, and neither is `await import()` inside a
try/catch: Metro bundles any module it can see referenced, so the module still loads. The only
reliable fix is for the file not to mention `expo-notifications` at all, which is why
`src/utils/pushNotifications.js` is a stub that always resolves to `null`. `AuthContext` calls
it on every sign-in and session restore, so it must never throw — signing in cannot be allowed
to depend on push.

`RegisterPushTokenController` therefore never runs in Expo Go, and no push token reaches the
backend. **In-app notifications are unaffected**: the notifications screen reads them from
`GET /api/notifications` and the backend's reminder job still writes them. Only the
device-level banner is missing.

To switch it on in a development build, swap in the real implementation kept beside the stub:

```powershell
# keep the stub — you need it to go back to Expo Go
Copy-Item src\utils\pushNotifications.js src\utils\pushNotifications.stub.js

Copy-Item src\utils\pushNotifications.withPush.js src\utils\pushNotifications.js
$env:EXPO_PUBLIC_ENABLE_PUSH = "1"
npx expo start -c
```

The `-c` matters: Metro caches the old module graph otherwise.

## What's built so far

- **Register / Login / Logout** — `RegisterController`, `LoginController`, `LogoutController`, `RestoreSessionController`
- **Profile** — `ViewProfileController`, `UpdateProfileController`
- **Runs** — `CreateRunController`, `ViewRunHistoryController`, `SearchRunHistoryController`,
  `ViewRunDetailsController`, `UpdateRunNameController`, `UpdateRunDescriptionController`,
  `UpdateRunController` (correct the figures), `DeleteRunController`, and `TrackRunController`
  (start / checkpoint / recover / discard / finish a run in progress)
- **Groups** — `CreateGroupController`, `ViewGroupDetailsController`, `UpdateGroupDetailsController`,
  `SearchGroupsController`, `JoinGroupController`, `LeaveGroupController`,
  `InviteUserToGroupController`, `RespondToJoinRequestController`, `RemoveMemberController`,
  `PromoteMemberController`, `ViewGroupTournamentsController`
- **Tournaments** — `CreateTournamentController`, `ViewTournamentDetailsController`,
  `UpdateTournamentDetailsController`, `DeleteTournamentController`, `SetTournamentLimitsController`,
  `UpdateTournamentStatusController`, `JoinTournamentController`, `ViewTournamentStandingsController`,
  `WithdrawFromTournamentController`
- **Rewards & Badges** — `ViewAvailableRewardsController`, `ClaimRewardController`,
  `ViewClaimedRewardsController`, `ViewUserBadgesController`
- **Leaderboards** — `ViewGlobalLeaderboardController`, `ViewGroupLeaderboardController`
- **Notifications** — `ViewNotificationsController`, `MarkNotificationReadController`,
  `ViewNotificationPreferencesController`, `UpdateNotificationPreferencesController`,
  `RegisterPushTokenController` (called automatically on login/register — see `utils/pushNotifications.js`)
- **Fitness Plans** — `ViewFitnessPlanController` (RU-13), `CreateFitnessPlanController` (RU-12),
  `UpdateFitnessPlanController` (RU-14), `DeleteFitnessPlanController` (RU-15),
  `ActivateFitnessPlanController`
- **Risk Assessment** — `ViewRiskScoreController` (RU-10), `UpdateRiskAssessmentFormController` (RU-11)
- **Run insights** — `ViewRunInsightsController` (RU-17, RU-18, RU-19)
- **Public Events** — `ViewPublicEventsController` (RU-39), `ViewPublicEventDetailsController` (RU-39),
  `JoinPublicEventController` (RU-40), `WithdrawFromPublicEventController` (RU-43),
  `AdminCreatePublicEventController` (SA-12), `AdminUpdatePublicEventController` (SA-14),
  `AdminDeletePublicEventController` (SA-15)
- **Instructor Board** — `ViewInstructorPostsController` (IU-07 / RU-44),
  `ViewMyInstructorPostsController` (IU-07), `ViewInstructorPostDetailsController` (IU-07 / RU-44),
  `CreateInstructorPostController` (IU-05), `UpdateInstructorPostController` (IU-06),
  `DeleteInstructorPostController` (IU-08). Instructor login/logout (IU-01, IU-02) and
  profile (IU-03, IU-04) reuse the shared auth and profile controllers.
- **Connected accounts** — `ViewConnectionsController`, `ConnectAccountController`,
  `DisconnectAccountController`, `SyncWearableController` (RU-16 devices, RU-49 social).
  `ConnectionsScreen` serves both; `route.params.kind` picks which list. Connecting opens
  the provider's own sign-in page in a browser — the app never handles those passwords.
- **Social sharing** — `ShareRunController`, `ShareTournamentResultController`, `ShareBadgeController`,
  all built on React Native's built-in `Share` API (opens the device's native share sheet).
  There is no "connect social account" flow — real OAuth integration per platform
  (Facebook, Instagram, X, Strava, TikTok) was deliberately not built, since it requires
  real developer credentials for five separate platforms.

## Screens and navigation

`src/navigation/AppNavigator.js` picks one of four stacks from the signed-in account's role, so
a runner never has an admin route to reach for:

| Stack | Who gets it | Starts at |
| --- | --- | --- |
| Unauthenticated | nobody signed in | `LandingScreen` → sign in or sign up |
| Runner | `registered_user` | `DashboardScreen` |
| Instructor | `instructor` | `InstructorDashboardScreen` |
| Admin console | `system_admin` | `AdminDashboardScreen` |

`src/boundary/` is the full list — around 60 screens, so it is the source of truth rather than
anything written here. The ones worth knowing by name:

- **Runner** — `DashboardScreen` (this week's real distance, risk score, unread badge),
  `LogRunScreen` and `LogPastRunScreen`, `RunHistoryScreen`, `RunDetailsScreen`,
  `RunInsightsScreen` (RU-17 to RU-19), `FitnessPlanScreen` (RU-12 to RU-15),
  `RiskAssessmentScreen` (RU-10, RU-11), `GroupsHubScreen`, `TournamentHubScreen`,
  `TournamentDetailsScreen`, `TournamentResultsScreen`, `PublicEventsScreen` and
  `PublicEventDetailsScreen` (RU-39, RU-40, RU-43), `RewardsScreen`, `LeaderboardScreen`.
- **Instructor** — `InstructorDashboardScreen`, `InstructorPostsScreen`,
  `InstructorCreatePostScreen`, `InstructorEditPostScreen`, `InstructorProfileScreen`,
  `MyCredentialsScreen` (IU-04: submit qualifications for SA-11 verification).
- **Admin** — `AdminUsersScreen` and `AdminUserDetailsScreen`, `AdminEditUserScreen`,
  `AdminCreateUserScreen`, `AdminGroupsScreen`, `AdminEditGroupScreen`, `AdminContentScreen`
  (rewards and badges), `AdminRunsScreen`, `AdminPublicEventsScreen` (SA-12 to SA-15),
  `AdminAnnouncementScreen`, `AdminAuditLogScreen`.
- **Shared** — `InstructorBoardScreen` and `InstructorPostDetailsScreen` serve runners for
  RU-44 too, swapping their bottom nav to match the signed-in role. `ConnectionsScreen` serves
  both wearables and social, chosen by `route.params.kind`. `WireframeExtras.js` holds seven
  small screens (email verification, appearance, help topics and so on) in one file rather than
  seven near-empty ones.

### Run tracking

`LogRunScreen` tracks for real: `expo-location` watches position every 3 s / 5 m, distance is
accumulated live with the Haversine formula in `src/utils/geo.js`, and the route is drawn as a
polyline on a live `react-native-maps` map. `RunDetailsScreen` redraws the saved route on a
static map.

Three things about it are worth knowing:

- **A run survives the app being killed.** Progress is mirrored to the server every 20 seconds
  (`TrackRunController`). On opening the screen it asks for anything left part-recorded; if
  there is, it restores the distance, time and route and offers *Save run* or *Discard*. It does
  not resume GPS by itself, since you may be home by then. If the server cannot be reached when
  the run starts, the run still goes ahead in memory and the screen says it cannot be recovered.
- **The route is thinned before it is sent.** `thinRoute()` in `src/utils/geo.js` keeps one point
  per ~10 m, capped at 5 000 points, always keeping the first and last. Location updates arrive
  every few seconds whether or not you moved, and the raw list used to be large enough that the
  request was rejected and a run over about 70 minutes could not be saved at all.
- **Saving is idempotent.** Each save carries a `clientRunId`, so a double tap on *Save run* or
  a retry after a dropped connection cannot store the run twice or pay the points twice.

`RunDetailsScreen` can also correct a saved run's distance, duration, calories and heart rate,
and delete it. Changing the distance moves the points the run earned, and the screen says by
how much. Tracking records no calories or heart rate — there is no sensor to read them from — so
those are the fields worth filling in afterwards.

### Recording with the screen off

A run keeps recording when the phone is locked or the runner switches apps — **in a build**.
It cannot in Expo Go, and that is a limitation of Expo Go rather than of this code: the
native background modes are not part of the Expo Go app, so `startLocationUpdatesAsync`
fails there however the permissions are set.

| Where | With the screen on | With the screen locked |
| --- | --- | --- |
| Expo Go | records normally | **stops** — the rest of the run is not recorded |
| Development or production build | records normally | keeps recording |

How it works: `src/utils/backgroundLocation.js` defines a task that the OS calls with new
fixes. That task runs outside React — on Android the app process may not even be in memory —
so it appends each fix to a buffer in AsyncStorage, and `LogRunScreen` drains that buffer
whenever the app returns to the foreground, extending the route and adding the distance. The
elapsed time is recomputed from the clock on return rather than resumed, because JavaScript
timers do not tick while an app is backgrounded.

Android requires a visible notification for this ("Run League is recording your run"), which
is the platform's choice and not optional: it is how a runner can always see that their
location is being recorded.

When background tracking is unavailable — Expo Go, or the runner choosing not to allow
location "all the time" — the run still records with the screen on, exactly as before, and
the reason appears on the Log Run screen rather than the difference being silent.

Session state (JWT token) is persisted with `AsyncStorage`, so the user stays logged in
between app restarts.

## Adding the next feature (pattern to follow)

Example for a new "Fitness Plan" feature (RU-12 to RU-15):

1. **`entities/FitnessPlan.js`** — a class with static methods (`create`, `getByUserId`,
   `update`, `delete`) that each call `request()` from `api/client.js`
2. **One controller file per use case** in `control/`:
   - `CreateFitnessPlanController.js` (RU-12)
   - `ViewFitnessPlanController.js` (RU-13)
   - `UpdateFitnessPlanController.js` (RU-14)
   - `DeleteFitnessPlanController.js` (RU-15)

   Each does its own validation, calls the entity, and returns
   `{ success, field, message, data }`.
3. **`boundary/FitnessPlanScreen.js`** — imports the controllers it needs directly,
   uses the theme tokens (`colors`, `type`, `spacing`, `radius`) for visual consistency
4. Register the new screen in `src/navigation/AppNavigator.js`

## Setup notes for new features

- **Maps**: `app.json` has a placeholder Google Maps API key
  (`android.config.googleMaps.apiKey`) required for Android. Get a free key from the
  Google Cloud Console (enable the "Maps SDK for Android") and paste it in. iOS uses
  Apple Maps by default and doesn't need a key.
- **Push notifications**: only work on a physical device — simulators/emulators can't
  generate real Expo push tokens. Test on a real phone via Expo Go to see this working.

## Tests

| Command | What it covers |
| --- | --- |
| `node tests/render_all_screens.cjs` | mounts every screen against a running backend, presses real buttons, and checks the server actually changed |
| `node tests/api_integration.mjs` | probes `src/api/client.js` at its edges — server down, non-JSON response, expired token, hung request |
| `npm run test:deps` | would `npm ci --include=dev` succeed? — the first thing an EAS build runs |
| `npm run check:deps` | the above as a one-shot check, offline and instant |
| `npm run check:audit` | triages `npm audit` against the advisories already reviewed |

Both need a backend and database up. `tests/README.md` has the setup, including the
`react-test-renderer` version pin — it must match the `react` version in `package.json` or
every mount fails against a second React copy.

The render harness is where screen-level regressions get caught, so it is worth adding to
rather than only running: it asserts, for example, that the dashboard shows the real weekly
distance computed from the API rather than a placeholder, that `thinRoute` keeps a long route
inside the server's cap, and that a run left part-recorded is offered back instead of lost.

The backend has its own suites, including `npm run test:stories` for all 84 user stories and
`npm run test:tracking` for run recording — see `backend/README.md`.

## Dependency advisories

`npm audit` reports around 30 vulnerable paths here, from four advisories. **Do not run
`npm audit fix --force`.** For three of the four, npm's suggested fix is `expo@44.0.6` — a
downgrade from SDK 57 to a 2021 release — because that is simply the only tree where the
advisory does not appear. The fourth suggests `@react-navigation/native@7`, a major upgrade
that breaks this app's navigators.

`npm run check:audit` triages them: each advisory below is recorded with a reason, and
**anything not on that list fails the check**, so a real advisory arriving later cannot hide
in the noise. The reasons in full are in `scripts/checkAudit.mjs`; the short version:

| Advisory | Severity | In the shipped app? | Fixable? |
| --- | --- | --- | --- |
| `braces` | high | **No** — Metro, the bundler | **No.** Affects `<=3.0.3`; 3.0.3 is the newest release there is |
| `node-forge` | high | **No** — Expo CLI code signing | **No.** Affects `<=1.4.0`; 1.4.0 is the newest release there is |
| `uuid` | moderate | **No** — the Xcode project writer | Patch exists, but not worth it: see below |
| `decode-uri-component` | moderate | **Yes**, but unreachable | Not safely: see below |

"In the shipped app" is not a guess. It comes from building a real production bundle and
reading the module list out of its source map:

```powershell
npx expo export --platform android --source-maps --output-dir dist
npm run check:audit        # cross-checks the table above against that bundle
Remove-Item -Recurse -Force dist
```

Of 1,004 modules in the bundle, `braces`, `micromatch`, `metro-file-map`, `node-forge`,
`uuid` and `xcode` are all absent — they run on the build machine, not the phone. If that
ever changes, `check:audit` fails rather than silently staying green.

The two with patches available, and why neither is taken:

- **`uuid`** reaches the tree through `xcode` inside `@expo/config-plugins`, which generates
  the iOS project during prebuild. A patched version exists (`>=11.1.1`) but overriding uuid
  across four majors underneath the thing that writes your Xcode project risks breaking the
  iOS build for no runtime gain. The flaw also requires `v3`/`v5`/`v6` called with an explicit
  `buf` argument, which this chain never does.
- **`decode-uri-component`** is the only one that does ship, via `query-string` inside
  `@react-navigation/core`. It is unreachable: `query-string` is used only by
  `getStateFromPath` and `getPathFromState`, which run only when `NavigationContainer` is
  given a `linking` prop — and it is given only `theme`. The one non-vulnerable release,
  `0.5.0`, is ESM-only with a default export, while `query-string` loads it with CommonJS
  `require()` and calls the result directly. Overriding it therefore makes that call throw
  `decodeComponent is not a function` — a crash that would appear the day deep linking is
  added, in exchange for a tidier audit number today. **Revisit when moving to React
  Navigation v7**, which is the real fix, or before enabling deep links.

The backend is clean — `cd ..\backend; npm audit` reports 0 vulnerabilities. It had two, both
genuinely fixable and both fixed: `nodemon` was an unused devDependency (the scripts use
`node --watch`) and was removed, taking `braces` with it; and `node-cron` went from 3 to 4,
which has no dependencies at all and so drops `uuid`.

## Notes

- No native build has been done yet — this only runs through Expo Go / the Expo dev client.
  A full `eas build` is a later step once the app is closer to submission-ready. Two features
  wait on it: device-level push notifications and background GPS.
- Maps render through Expo Go on iOS without a key (Apple Maps). On Android they need the
  Google Maps key in `app.json` — until it is filled in, the map area stays blank while
  tracking, distance and everything else still work.
