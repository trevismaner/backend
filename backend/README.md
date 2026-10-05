# Run League Backend

Node.js + Express + PostgreSQL backend, following BCE (Boundary-Control-Entity) architecture.

## Folder Structure

```
backend/
├── boundary/     # Express routes — the "B" in BCE, handles HTTP in/out
├── control/      # Business logic — the "C" in BCE, one controller file per use case
├── entities/     # Database models — the "E" in BCE, one class per table
├── middleware/   # Auth middleware (JWT verification, role checks)
├── config/       # Database connection (db.js) and transaction helper (transaction.js)
├── jobs/         # Scheduled work — reminderScheduler.js, started by server.js
├── db/           # SQL schema and migrations, applied in numbered order
├── scripts/      # One-off CLI tasks (create the first admin, seed demo data)
├── tests/        # Test suites — see "Tests" below
├── server.js     # App entry point — wires everything together
└── .env.example  # Copy to .env and fill in your own values
```

Each use case gets its own controller file (e.g. `RegisterController.js`, `LoginController.js`,
`CreateRunController.js`), rather than grouping multiple use cases into one controller per
feature area. Route files in `boundary/` import each controller individually.


## Why bcryptjs, not bcrypt

`bcryptjs` is a pure-JavaScript implementation. The native `bcrypt` package runs a
`node-gyp` install script to build a binary, which newer npm versions block by default
(`install scripts not yet covered by allowScripts`) and which needs Visual Studio Build
Tools on Windows. `bcryptjs` has no install script and no compiler step.

The hashes are interchangeable — both produce `$2b$` — so a password hashed by either
package verifies against the other. Switching needs no database change. It is slower, which
does not matter at this scale.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up PostgreSQL**
   - Create a database: `createdb run_league`
   - Run the schema: `psql run_league < db/schema.sql`
   - Run the migrations, in order:
     `psql run_league < db/001_system_admin.sql`,
     `psql run_league < db/002_admin_extensions.sql`,
     `psql run_league < db/003_connected_accounts.sql`,
     `psql run_league < db/004_instructor_credentials.sql`,
     `psql run_league < db/005_run_tracking.sql`,
     `psql run_league < db/006_leaderboard_totals.sql`,
     `psql run_league < db/007_plan_sessions.sql`

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then fill in your actual `DB_PASSWORD` and generate a random `JWT_SECRET`
   (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

4. **Run the server**
   ```bash
   npm run dev
   ```
   Server starts on `http://localhost:3000`. Check it's working: `curl http://localhost:3000/health`

## What's built so far

- **Auth**: register (UU-01/UU-02), login (RU-01), logout (RU-02)
- **Profile**: view (RU-03), update (RU-04). `GET /api/profile` returns the user plus a
  `stats` block — lifetime run count, total distance, total duration, longest run, and first
  and last run dates — added up in SQL by `Run.getTotalsForUser()`. The profile screen reads
  its figures from there instead of fetching the run history and summing it in the app.
- **Runs**: create (RU-05), view history (RU-06), search (RU-07), update name (RU-08), update
  description (RU-09), plus correcting the figures, deleting your own run, and recording a run
  while it is still in progress — see **Run tracking** below
- **Groups**: create, view details, update, search, join, leave, invite, respond to join
  request, remove member, promote member — all under Registered User (Group Admin is a
  per-group flag, not a separate account type)
- **Tournaments**: create (nested under a group), view details, update, delete, set
  participant limits/deadline, update status (open → in_progress → completed), join,
  view standings, withdraw
- **Rewards & Badges**: view available rewards, claim a reward, view claimed history,
  view earned badges. Points are earned automatically (10 pts/km) when a run is saved;
  badges (First Steps, Consistent Runner, Marathoner) are checked and awarded
  automatically after each run.
- **Leaderboards**: global leaderboard (ranked by total distance) and per-group leaderboard
- **Notifications**: view notifications, mark as read, view/update notification preferences,
  register a push token. A daily cron job (`jobs/reminderScheduler.js`, runs via `node-cron`)
  generates exercise reminders (no run in 3 days) and overtraining alerts (5+ runs in 7 days),
  delivered as real push notifications via `expo-server-sdk`.
- **Fitness Plans** (RU-12 to RU-15): create, view, update, delete. Only one plan is active
  at a time — creating or activating one stands the others down — and the view returns this
  week's progress against the plan's weekly target.
- **Risk Assessment** (RU-10, RU-11): submitting the form rescores immediately.
  Scoring lives in `control/RiskScoringService.js` as transparent rules over data the app
  already has (acute:chronic training load, soreness, unresolved injuries, declared
  conditions, heart-rate drift), filling the `ml_base_score` + modifier columns the schema
  was shaped for. To swap in the Python AI service later, replace `computeBaseScore()` with
  the HTTP call — the stored columns and response shape do not change.
- **Public Events** (RU-39, RU-40, RU-43 + SA-12 to SA-15): platform-wide events with no
  group. Status is derived from the dates rather than stored, so it cannot drift. Capacity
  is checked inside a locked transaction, so two people cannot take the last place at once.
- **Run insights** (RU-17, RU-18, RU-19): `GET /api/runs/insights` aggregates calories,
  heart rate, and 7-day and 30-day trends against the preceding window.
- **Instructor Board**: create (IU-05), update (IU-06), read (IU-07, also serves RU-44),
  delete (IU-08). Reading is open to any signed-in user; writing requires a *verified*
  instructor, enforced by `middleware/requireVerifiedInstructor.js` — SA-11 exists so that
  "only qualified professionals can post on the Instructor Board". A post is visible on the
  public board only while its author is verified and not suspended; authors always see their
  own posts, so an instructor can draft while their credentials are under review. System
  admins can edit and delete any post (SA-17, SA-18).
- **Social sharing**: no backend component — sharing is handled entirely client-side using
  the device's native share sheet (see `mobile/README.md`). Real OAuth "connect account"
  integration for Facebook/Instagram/X/Strava/TikTok was deliberately not built, since it
  requires real developer credentials for five separate platforms.

## Run tracking

A finished run is saved with `POST /api/runs`. Everything below is about the rest of a run's
life: while it is being recorded, and after it has been saved.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs` | save a finished run (RU-05) |
| GET | `/api/runs` | history, newest first (RU-06). `?limit=` 1–200, `?offset=` |
| GET | `/api/runs/search?q=` | search names and descriptions (RU-07) |
| GET | `/api/runs/insights` | calories, heart rate, 7- and 30-day trends (RU-17/18/19) |
| GET | `/api/runs/:runId` | one run, including its GPS route |
| PATCH | `/api/runs/:runId` | correct distance, duration, dates, calories, heart rate |
| DELETE | `/api/runs/:runId` | delete your own run |
| PATCH | `/api/runs/:runId/name` | rename (RU-08) |
| PATCH | `/api/runs/:runId/description` | annotate (RU-09) |
| POST | `/api/runs/active` | start recording |
| GET | `/api/runs/active` | what is being recorded, if anything |
| PATCH | `/api/runs/active` | checkpoint progress |
| DELETE | `/api/runs/active` | throw the run away unsaved |
| POST | `/api/runs/active/finish` | turn the run in progress into a saved run |

**A run in progress survives the app being killed.** It used to live only in the phone's
memory, so a crash, a low-memory kill or a flat battery lost the whole run. The app now
checkpoints to `active_runs` (migration 005) every 20 seconds. `active_runs` is keyed by
`user_id`, so a user has at most one run in progress and starting a second returns `409` with
the first attached rather than quietly discarding it. On opening the Log Run screen the app
asks `GET /api/runs/active`; if something is there it restores the distance, time and route and
offers *Save* or *Discard* — it does not silently resume GPS, since the runner may be home by
then. `finish` saves the run and clears the active row in one transaction, so finishing twice
cannot store the run twice (the second call gets a `404`).

**Deleting or correcting a run moves the points with it.** Points are 10/km
(`control/RunRewards.js`, shared by every path so the three cannot disagree). Deleting reclaims
what the run paid out, floored at zero in case it has already been spent — without that,
log-collect-delete would mint points indefinitely. Admin deletion reclaims too. Correcting the
distance adjusts by the difference and returns `pointsAdjustment`. Badges are deliberately left
alone: they mark something that was reached at the time, and silently removing an achievement
over a corrected distance would be worse than keeping it. An admin can revoke a badge where a
run was faked.

**GPS routes are capped and the body limit is raised.** `express.json()` takes a 2 MB limit
rather than Express's 100 kB default: a run carries its whole route in the request body, and at
one point every few seconds the default was exceeded part way through — a run over roughly 70
minutes could not be saved at all. The route itself is capped at `MAX_ROUTE_POINTS` (5 000) in
`control/RunValidation.js`, and the app thins points closer together than 10 m before sending,
which the drawn line is indistinguishable from. Past the cap the answer is a `400` naming the
problem; an oversized request is a `413`, not a `500`.

**Validation lives in one place.** `control/RunValidation.js` is shared by create, correct and
checkpoint. It refuses an `endedAt` before the `startedAt`, a `startedAt` in the future, a pace
no human reaches (over 45 km/h — almost always a mis-typed duration, and an accepted one would
sit in leaderboards and tournaments until an admin noticed), a duration over 24 hours, a
`routeGps` that is not an array of points with real coordinates, negative calories or heart
rates, a `maxHeartRate` below the `avgHeartRate`, and a name past the column's 100 characters.
A distance sent as a string still coerces, a 0 km run with a duration is still fine (a treadmill
with no GPS), and both `{latitude, longitude}` and the `{lat, lng}` spelling in `schema.sql` are
accepted.

**Saving the same run twice is prevented.** The app sends a `clientRunId` with each save, unique
per user in the database. A double tap or a retry after a dropped connection returns the run
already stored (`200` with `alreadySaved: true`) instead of recording it again and paying the
points twice. Callers that send no key keep the old behaviour, so two genuinely separate runs
logged for the same moment are both kept.

## The fitness planner

A plan used to hold a goal and a weekly frequency — "4 runs a week for 12 weeks" — with
nothing to actually follow on a Tuesday. Migration 007 gives it a week-by-week schedule.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/fitness-plans/:planId/generate` | build a schedule; answers `202`, poll for the result |
| GET | `/api/fitness-plans` | the plan, its `schedule`, and `scheduleProgress` |
| PATCH | `/api/fitness-plans/sessions/:sessionId/complete` | tick a session off against a run |
| DELETE | `/api/fitness-plans/sessions/:sessionId/complete` | un-tick it |

**It works with no AI configured.** `control/PlanBuilder.js` builds a schedule from
arithmetic: volume rises about 10% a week, every fourth week is lighter, the long run takes
roughly a third of the week, race plans taper over the final two weeks, and the first week is
anchored to what the runner has actually been doing rather than starting from nothing. A
runner already flagged as high risk is started *below* their recent volume, since handing
them more is the pattern the risk score exists to catch.

Set `AI_PROVIDER` and `AI_API_KEY` and a language model writes the schedule instead. The
plan records which it was in `generated_by`, and the app shows it — a generated plan should
never be passed off as something it is not.

**What is sent to the provider:** derived figures only — weekly volume, run count, goal,
duration, and the risk *level*. Declared conditions, injury descriptions, names and emails
are deliberately not sent. Health details about an identifiable person should not leave the
server for a nice-to-have, and "moderate risk" carries the same planning signal as the
reasons behind it. It also means no user-typed string ends up in the prompt, so there is
nothing for someone to put instructions into.

**The model's answer is validated before it is stored**, by the same function that checks the
rules-built plan: right number of weeks, no duplicate week numbers, no two sessions on one
day, known session types, plausible distances. Anything that fails is rejected and the
rules-built plan is used, with a line in the coach notes saying so. A plausible-looking answer
is not the same as a usable one, and an unchecked model response is just untrusted input.

Generation runs **after** the response, not during it: a model takes seconds, and a mobile
client holding a request open that long is how a screen ends up looking frozen. The endpoint
marks the plan `generating` and returns `202`; the app polls `GET /api/fitness-plans` until
`generationStatus` changes. A second generation while one is running is refused with `409`,
so a double-tapped button is not two provider calls and two bills.

Run `npm run test:planner` to exercise both paths, including a provider that times out,
returns prose instead of JSON, or returns a plan with nine days in a week.

## Rate limiting

Three limits, in `middleware/rateLimit.js`, because they exist for different reasons:

| Limiter | Applies to | Default |
|---|---|---|
| `apiLimiter` | everything under `/api` | 300/minute per user or IP |
| `authLimiter` | register and login | 20 failed attempts per IP per 15 minutes |
| `expensiveLimiter` | plan generation | 10 per user per hour |

Counted per signed-in user where there is one and per IP otherwise, so everyone behind one
university NAT does not share a single allowance. IPv6 addresses are narrowed to their subnet
before being used as a key — a single customer is routinely given a whole /64, and keying on
the full address would let one client present billions of distinct "IPs" and never hit a
limit. All three are skipped when `NODE_ENV=test`, since the suites hammer the API on purpose.

`app.set('trust proxy', 1)` in `server.js` matters once deployed: behind a load balancer every
request otherwise appears to come from the proxy and the whole platform shares one bucket.

## Fitness plan, risk and public event endpoints

| Method | Path | Story |
|---|---|---|
| POST | `/api/fitness-plans` | RU-12 |
| GET | `/api/fitness-plans` | RU-13 (active plan + progress + past plans) |
| PUT | `/api/fitness-plans/:planId` | RU-14 |
| DELETE | `/api/fitness-plans/:planId` | RU-15 |
| PATCH | `/api/fitness-plans/:planId/activate` | switch back to an earlier plan |
| GET | `/api/risk-assessment` | RU-10 |
| PUT | `/api/risk-assessment/form` | RU-11 (saves and rescores) |
| GET | `/api/runs/insights` | RU-17, RU-18, RU-19 |
| GET | `/api/public-events` | RU-39 |
| GET | `/api/public-events/:eventId` | RU-39 |
| POST | `/api/public-events/:eventId/join` | RU-40 |
| POST | `/api/public-events/:eventId/withdraw` | RU-43 |
| POST | `/api/admin/public-events` | SA-12 |
| GET | `/api/admin/public-events` | SA-13 |
| PUT | `/api/admin/public-events/:eventId` | SA-14 |
| DELETE | `/api/admin/public-events/:eventId` | SA-15 |

## Instructor Board endpoints

All under `/api/instructor-posts`, all requiring a signed-in user:

| Method | Path | Story | Who |
|---|---|---|---|
| GET | `/` | IU-07 / RU-44 | any signed-in user (`?category=`, `?search=`, `?page=`, `?limit=`) |
| GET | `/mine` | IU-07 | the instructor's own posts + dashboard stats |
| GET | `/:postId` | IU-07 / RU-44 | any signed-in user |
| POST | `/` | IU-05 | verified instructor or system admin |
| PUT | `/:postId` | IU-06 | the author, or a system admin |
| DELETE | `/:postId` | IU-08 | the author, or a system admin |

Categories are `training`, `nutrition`, `recovery`, `injury_prevention` (exported as
`POST_CATEGORIES` from `entities/InstructorPost.js`); a post may also have no category.

## External services

| Service | State | What it needs |
|---|---|---|
| **Weather** (Open-Meteo) | **Connected** | Nothing — no API key, no account. `control/WeatherService.js` |
| Push notifications (Expo) | Connected | A physical device to test on |
| Risk scoring | Local rules (`control/RiskScoringService.js`) | Swap `computeBaseScore()` for an HTTP call to use the Python service |
| **Wearables** (RU-16) | **Built** — add credentials to switch on | Client id/secret per provider. Fitbit also imports activities |
| **Social** (RU-49) | **Built** — add credentials to switch on | Client id/secret per platform |
| Google Maps | Key placeholder | A key in `mobile/app.json` (Android only) |

Weather is read live from `https://api.open-meteo.com` and feeds `weather_modifier` on the
risk score. Everything degrades: if the lookup fails, times out (4s) or returns something
unexpected, the score falls back to a fixed hot-and-humid allowance and sets
`explanation.weatherIsLive = false`. Readings are cached for 30 minutes per location, and
the location comes from the last GPS point of the user's most recent run.

Optional overrides: `WEATHER_API_URL`, `DEFAULT_LATITUDE`, `DEFAULT_LONGITUDE`.

Run `node tests/weather_service.test.mjs` to exercise parsing, scoring, caching and every
failure path against a local stub.

## Connecting an outside account (RU-16, RU-49)

Providers are listed in `control/oauthProviders.js` and stay inert until their credentials
are in `.env` — the app reports them as unavailable rather than offering a button that
cannot work. Nothing about the code changes when you add credentials.

To switch one on:

1. Register an app with the provider (links are in `oauthProviders.js`).
2. Set its redirect URI to `<OAUTH_REDIRECT_BASE>/<provider>/callback`,
   e.g. `http://localhost:3000/api/connections/fitbit/callback`.
3. Put the client id and secret in `.env` and restart.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/connections` | Every provider, with availability and connection state |
| POST | `/api/connections/:provider/connect` | Returns the URL to open for sign-in |
| GET | `/api/connections/:provider/callback` | Where the provider sends the user back (no auth — the one-time `state` identifies them) |
| DELETE | `/api/connections/:provider` | Unlink, revoking upstream where supported |
| POST | `/api/connections/:provider/sync` | Import activities as runs (RU-16) |

The handshake uses PKCE where the provider supports it, and a single-use `state` that
expires after 15 minutes. Access tokens are never returned to the app, and expired tokens
refresh automatically before a sync.

Imported runs record the provider's activity id, and a unique index on
`(user_id, source, external_id)` means re-syncing cannot create duplicates. They carry heart
rate and calories, so they feed RU-17/18/19 and the risk score like any logged run.

Fitbit has an activity importer; Garmin and Samsung Health connect but cannot import yet
(their activity APIs need a signed developer agreement, so no adapter was guessed at).
Apple Health is listed but not connectable — it is an on-device framework needing a native
build, not a web API.

Run `node tests/connections.test.mjs` to exercise the whole flow against a local stub.

## Setup note for new features

- `db/schema.sql` now includes starter reference data (4 rewards, 5 badges) inserted directly
  via `INSERT` statements — re-running the schema will populate these automatically.
- The reminder scheduler starts automatically when the server starts. To test it without
  waiting for the daily 09:00 trigger, temporarily import and call `runReminderJobNow()`
  from `jobs/reminderScheduler.js` in `server.js`, or adjust the cron expression.
- Push notifications require a physical device (Expo push tokens aren't generated on simulators).

## Testing the endpoints

Use Postman, Insomnia, or curl. If you have run `npm run seed`, skip registering and log in
as one of the seeded accounts instead (see **Demo data** below) — they already have runs,
groups and tournaments to look at.

Example flow from scratch:

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Copy the "token" from the response, then use it for authenticated requests:
curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Log a run
curl -X POST http://localhost:3000/api/runs \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"distanceKm": 5.2, "durationSeconds": 1800, "startedAt": "2026-09-04T07:00:00Z"}'
```

Recording a run the way the app does it — start, checkpoint, then finish:

```bash
TOKEN=YOUR_TOKEN_HERE
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

curl -X POST  http://localhost:3000/api/runs/active "${AUTH[@]}" -d '{}'
curl -X PATCH http://localhost:3000/api/runs/active "${AUTH[@]}" \
  -d '{"distanceKm":2.4,"durationSeconds":600,"routeGps":[{"latitude":-34.406,"longitude":150.878}]}'

# what a restarted app would see
curl http://localhost:3000/api/runs/active "${AUTH[@]}"

curl -X POST http://localhost:3000/api/runs/active/finish "${AUTH[@]}" -d '{"name":"Evening 5K"}'
```

The same flow in PowerShell, where the bash array above will not work:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:3000/api/auth/login -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"alice@runleague.test","password":"Password123"}'
$auth = @{ Authorization = "Bearer $($login.token)" }

Invoke-RestMethod -Uri http://localhost:3000/api/runs/active -Method Post -Headers $auth `
  -ContentType 'application/json' -Body '{}'

Invoke-RestMethod -Uri http://localhost:3000/api/runs/active -Method Patch -Headers $auth `
  -ContentType 'application/json' -Body '{"distanceKm":2.4,"durationSeconds":600}'

Invoke-RestMethod -Uri http://localhost:3000/api/runs/active -Headers $auth          # resume
Invoke-RestMethod -Uri http://localhost:3000/api/runs/active/finish -Method Post -Headers $auth `
  -ContentType 'application/json' -Body '{"name":"Evening 5K"}'
```

## Adding the next feature (pattern to follow)

Example for a new "Fitness Plan" feature (RU-12 to RU-15):

1. **`entities/FitnessPlan.js`** — one class with `toJSON()`, plus static methods like
   `create()`, `findByUserId()`, `update()`, `delete()` that run the actual SQL queries
2. **One controller file per use case** in `control/`:
   - `CreateFitnessPlanController.js` (RU-12)
   - `ViewFitnessPlanController.js` (RU-13)
   - `UpdateFitnessPlanController.js` (RU-14)
   - `DeleteFitnessPlanController.js` (RU-15)

   Each file exports a single default function, imports only the entity it needs,
   and does its own validation before calling the entity.
3. **`boundary/fitnessPlanRoutes.js`** — imports each controller individually and maps
   it to a route, wrapped in `requireAuth`
4. Register the new route file in `server.js`: `app.use('/api/fitness-plans', fitnessPlanRoutes)`

## What is deliberately not built

Everything in the spec is implemented — `npm run test:stories` walks all 84 user stories.
Two are marked *out of app* there because they cannot be satisfied by this codebase:

- **Real OAuth for the five social platforms** (Facebook, Instagram, X, Strava, TikTok). The
  handshake is written and tested against a stub; switching it on needs real developer
  credentials from each platform. Sharing itself works, via the device's native share sheet.
- **Garmin and Samsung Health activity import.** They connect, but their activity APIs need a
  signed developer agreement, so no adapter was guessed at. Fitbit imports.

Smaller gaps worth knowing about:

- **Device-level push notifications** need a development build; Expo Go cannot generate a real
  push token. In-app notifications work regardless. See `mobile/README.md`.
- **Risk scoring is local rules**, not the Python AI service — `control/RiskScoringService.js`
  fills the same `ml_base_score` + modifier columns, so swapping `computeBaseScore()` for an
  HTTP call changes nothing else.
- **Background GPS.** Tracking stops when the phone is locked, because it uses foreground
  location only. Background tracking needs `expo-location`'s background task and a native
  build.
- **Calories and heart rate are not measured during a tracked run** — there is no sensor to
  read them from. They can be filled in afterwards on the run details screen, and runs
  imported from a wearable carry them.

## Notes

- Passwords are hashed with `bcryptjs` before storage — never store plaintext passwords
  (see **Why bcryptjs, not bcrypt** above)
- JWTs are stateless — logout is handled client-side (the app just discards the token);
  the `/api/auth/logout` endpoint exists mainly for consistency and future extensibility
- `toJSON()` vs `toSafeJSON()` on entities: use `toJSON()` when returning a user's own data,
  `toSafeJSON()` when returning another user's data to someone else (e.g. a group member list)
  so you never accidentally leak fields like `passwordHash`
- **There is no password strength rule.** Registration checks only that a password was supplied,
  so a single character is accepted. Nothing depends on it being weak — adding a minimum length
  and complexity check in `control/RegisterController.js` (and the matching one in
  `AdminCreateUserController.js` and `AdminUpdateUserController.js`) is self-contained.

## System admin

- Create the first admin (or promote an existing account):
  `npm run admin:create -- admin@example.com "StrongPass123" "Admin Name"`
- All admin endpoints are under `/api/admin` and require a system admin's JWT
  (`boundary/adminRoutes.js`). Admin use cases follow BCE:
  `boundary/Admin*Boundary.js` (HTTP) → `control/Admin*Controller.js` (rules, no req/res) → `entities/`.
- Every admin action is recorded in `admin_audit_logs` (`GET /api/admin/audit-logs`).


## Recording tournament results

Standings rank whatever finishing times have been recorded, so something has to record them:

| Method | Route | Who |
| --- | --- | --- |
| `PATCH` | `/api/tournaments/:tournamentId/results` | group admin (any participant) or a participant (themselves) |

Body is `{ resultTimeSeconds, userId? }`. Omit `userId` to record your own time; a group admin
passes one to record for someone else. `resultTimeSeconds: null` clears a time recorded in
error. The response carries the updated standings.

Results are refused while the tournament is still `open` — there is nothing to record before
it starts. Recording against a `completed` tournament is allowed so a mistake can be fixed,
and re-ranks everyone when it happens. Participants with no time get no rank.

In the app this is the **Record Results** button on the tournament detail screen (shown as
*Record My Time* to a participant who is not a group admin). Times are typed as `1:25:12`,
`25:12`, or a plain number of minutes.

## Instructor credentials (IU-04 / SA-11)

`users.credentials_verified` used to be a bare boolean: an admin could mark an instructor
verified, but the instructor had no way to submit anything and the admin had nothing to look
at. Migration 004 adds the details, and two endpoints carry them:

| Method | Route | Who |
| --- | --- | --- |
| `GET` | `/api/profile/credentials` | the instructor — what they submitted and its status |
| `PUT` | `/api/profile/credentials` | the instructor — submit or resubmit |

Status is one of `not_submitted`, `pending` or `verified`. Resubmitting replaces the details
and returns the account to `pending`, because what was verified has changed. The admin sees
the submitted qualification and reference on the user's detail screen before deciding, and
verifies with `PATCH /api/admin/users/:userId/instructor-verification`.

An instructor can always read and manage their own posts while pending — only publishing to
the public board is gated.

## Demo data

`npm run seed` fills the database with a worked example of the whole app, so every role can
be logged into without clicking anything into existence first. `npm run seed:reset` empties
the application tables first (it refuses to run when `NODE_ENV=production`).

Every seeded account uses the password **`Password123`**:

| Account | Email | What it demonstrates |
| --- | --- | --- |
| System admin | `admin@runleague.test` | everything under `/api/admin`, 2 public events |
| Instructor (verified) | `coach@runleague.test` | can publish to the instructor board |
| Instructor (unverified) | `newcoach@runleague.test` | blocked from posting until SA-11 verification |
| Runner — active | `alice@runleague.test` | 12 runs, group admin, 3 tournaments, a fitness plan |
| Runner — top of board | `ben@runleague.test` | 16 runs, a claimed reward, triggers the overtraining alert |
| Runner — returning | `chloe@runleague.test` | 1 run, a risk assessment on file |
| Runner — brand new | `dan@runleague.test` | no runs, so the exercise reminder job has a target |
| Runner — suspended | `suspended@runleague.test` | login is refused with 403 |

It also creates 3 groups (public, private with a pending request and an invite, and one
suspended), 3 tournaments covering all three statuses — the completed one has ranked results —
2 admin-run public events, 3 instructor posts, 2 fitness plans and 2 risk assessments.

Seed a scratch database, not your real one:

```bash
createdb run_league_demo
psql run_league_demo < db/schema.sql
for f in db/0*.sql; do psql run_league_demo < "$f"; done   # 001 through 007
# point .env at it (DB_NAME=run_league_demo), then:
npm run seed:reset
```

## Tests

| Command | What it covers | Needs a running server |
| --- | --- | --- |
| `npm run test:e2e` | every route end to end, including the concurrency cases | yes |
| `npm run test:tracking` | long GPS routes, runs in progress, delete/correct, points, validation | yes |
| `npm run test:planner` | the fitness planner: progression rules, validation, model fallbacks | yes |
| `npm run test:seed` | each seeded role sees the right data; SA-06 and SA-21 | yes, seeded |
| `npm run test:stories` | every user story in the spec, one by one | yes |
| `npm run test:features` | public events, fitness plans, risk assessment, instructor posts, credentials | yes, seeded |
| `npm run test:connections` | the OAuth handshake, token refresh, activity import | yes, see below |
| `npm run test:weather` | weather parsing, scoring, caching, failure paths | no |

The mobile app has two of its own, in `../mobile/tests/` — see `mobile/README.md`.

`test:e2e`, `test:seed` and `test:stories` create users and check exact counts, so they need
an **empty test database** — never your real one:

```bash
dropdb --if-exists run_league_test && createdb run_league_test
psql run_league_test < db/schema.sql
for f in db/0*.sql; do psql run_league_test < "$f"; done   # 001 through 007, in order
# point .env at run_league_test (DB_NAME=run_league_test), then:
npm run admin:create -- admin@uow.edu.au Password123 "Sys Admin"
npm start              # terminal 1
npm run test:e2e       # terminal 2  (set TEST_URL if not on port 3000)
npm run test:tracking  # terminal 2  (same database is fine — it creates its own users)
```

`test:stories` and `test:connections` also read the database directly with `psql`, and default
to a database named `run_league_verify` (override with `TEST_DB`). If your PostgreSQL needs
credentials, set `PGUSER`, `PGPASSWORD` and `PGHOST` to match the `DB_*` values in `.env`.

`test:seed` and `test:features` both expect a **freshly seeded** database and change data as
they run — renaming a user, resetting a password, verifying an instructor — so run
`npm run seed:reset` before each of them, including between the two. Running `test:features`
straight after `test:seed` without re-seeding fails about nine checks, because the data it
looks for has already been consumed.

### Windows (PowerShell)

The commands above are bash. In PowerShell the differences are:

| bash | PowerShell |
| --- | --- |
| `DB_NAME=x npm start` | `$env:DB_NAME="x"` on its own line, then `npm start` |
| `for f in db/0*.sql; do psql db < "$f"; done` | `Get-ChildItem db\0*.sql \| Sort-Object Name \| ForEach-Object { psql -d db -f $_.FullName }` |
| `psql db < db/schema.sql` | `psql -d db -f db/schema.sql` |
| `curl ...` | `curl.exe ...` (plain `curl` is an alias for `Invoke-WebRequest`) |
| `lsof -ti:3000 \| xargs kill` | `Get-NetTCPConnection -LocalPort 3000 \| Select-Object -Expand OwningProcess \| ForEach-Object { taskkill /PID $_ /F }` |

`$env:VAR` stays set for the rest of that terminal window, so set it once per terminal rather
than per command. `Remove-Item Env:\DB_NAME` clears it.

`createdb` and `psql` ship with the PostgreSQL Windows installer but are often not on PATH.
Either add `C:\Program Files\PostgreSQL\16\bin` to PATH, or use the full path:
`& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -d run_league_demo -f db\schema.sql`

`test:stories` and `test:connections` shell out to `psql`, so it must be on PATH for those two.
Set `$env:PGPASSWORD`, `$env:PGUSER` and `$env:PGHOST` to match the `DB_*` values in `.env`.

Posting JSON with curl is awkward in PowerShell because of quoting. `Invoke-RestMethod` is easier:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:3000/api/auth/login -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"admin@runleague.test","password":"Password123"}'
$token = $login.token
Invoke-RestMethod -Uri http://localhost:3000/api/admin/stats `
  -Headers @{ Authorization = "Bearer $token" }
```


### Running the connections test

It drives the OAuth flow against a stub provider on port 4901, so the server has to be started
with stub Fitbit credentials pointing at it. These belong in the environment only while
testing — never in a real `.env`:

```bash
FITBIT_CLIENT_ID=stub-client-id \
FITBIT_CLIENT_SECRET=stub-client-secret \
FITBIT_AUTHORIZE_URL=http://localhost:4901/oauth2/authorize \
FITBIT_TOKEN_URL=http://localhost:4901/oauth2/token \
FITBIT_REVOKE_URL=http://localhost:4901/oauth2/revoke \
FITBIT_API_URL=http://localhost:4901 \
npm start                     # terminal 1

TEST_DB=run_league_test npm run test:connections   # terminal 2
```

`OAUTH_REDIRECT_BASE` must end in `/api/connections`, matching where the callback route is
mounted. If it does not, the provider redirects users to a URL that does not exist and no
connection can ever complete.
