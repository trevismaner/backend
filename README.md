# Run League

A running and tournament app: log runs by GPS, join groups, compete in tournaments, earn
points and badges, and get an injury-risk score from your own training data.

Two halves, each with its own README:

| | What it is | Read next |
| --- | --- | --- |
| **`backend/`** | Node.js + Express + PostgreSQL REST API | [`backend/README.md`](backend/README.md) |
| **`mobile/`** | React Native + Expo app | [`mobile/README.md`](mobile/README.md) |

Both follow **BCE** (Boundary–Control–Entity), the same structure on both sides:

```
boundary/   HTTP routes (backend) / screens (mobile)  — talks to the outside world
control/    one file per use case                     — the rules, no HTTP, no SQL
entities/   one class per table (backend) / per API resource (mobile)
```

A screen calls a controller, which calls an entity, which calls the API — and on the server a
route calls a controller, which calls an entity, which runs the SQL. Nothing skips a layer.

## Running it, shortest path

Putting it online? **[`DEPLOY.md`](DEPLOY.md)** covers the hosted database and the API.
Shipping to the App Store or Google Play? **[`RELEASE.md`](RELEASE.md)**.

Starting from a machine with nothing installed? **[`SETUP.md`](SETUP.md)** is the full
walkthrough — prerequisites, every command, what correct output looks like at each step, and a
troubleshooting table. The version below assumes Node, PostgreSQL and Expo Go are already
there.

The backend has to be up before the app is of any use. In PowerShell:

```powershell
# ── 1. database ──────────────────────────────────────────────────────────────
createdb run_league
psql -d run_league -f backend\db\schema.sql
Get-ChildItem backend\db\0*.sql | Sort-Object Name | ForEach-Object { psql -d run_league -f $_.FullName }

# ── 2. backend ───────────────────────────────────────────────────────────────
cd backend
npm install
Copy-Item .env.example .env
#   >>> now open .env and fill in DB_PASSWORD and JWT_SECRET before going on <<<
#   the server will not start without them

npm run seed                     # optional: demo data for every role
npm run dev                      # http://localhost:3000 — leave this running

# ── 3. app, in a second terminal ─────────────────────────────────────────────
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL = "http://YOUR-IP-HERE:3000/api"
npx expo start                   # scan the QR code with Expo Go
```

Find your IP with `ipconfig` — the IPv4 address of your Wi-Fi adapter. Your phone and computer
must be on the same network. `localhost` only works for an iOS simulator; an Android emulator
wants `http://10.0.2.2:3000/api`.

If you ran `npm run seed`, sign in as **`alice@runleague.test`** with **`Password123`** — she has
12 runs, a group she administers, three tournaments and a fitness plan. `backend/README.md`
lists the other seven accounts, one per role.

## Tests

Twelve suites, 682 checks. All but `test:weather`, `test:deps` and `test:migrations` need the
backend running, and they split into two groups by the database state they expect —
[`SETUP.md`](SETUP.md#9-running-the-tests) has the order that works.

```powershell
cd backend
npm run test:e2e         # every route end to end, including the concurrency cases
npm run test:tracking    # run recording: long GPS routes, recovery, points, validation
npm run test:stories     # all 84 user stories, one by one
npm run test:features    # public events, fitness plans, risk assessment, instructor posts
npm run test:planner     # the fitness planner: progression, tapering, AI fallback
npm run test:seed        # each seeded role sees the right data
npm run test:connections # the OAuth handshake, against a local stub
npm run test:weather     # weather parsing, scoring, caching, failure paths — no server needed
npm run test:migrations  # catching up a database that predates a migration — needs CREATEDB

cd ..\mobile
node tests\render_all_screens.cjs   # mounts every screen, presses real buttons
node tests\api_integration.mjs      # the API client at its edges
npm run test:deps                   # would `npm ci` succeed? — no server needed
```

Two things make these fail on a working project, both covered in `SETUP.md`: the server has to
be started with `$env:NODE_ENV = "test"` or the rate limiter starts returning `429` partway
through, and `test:seed` and `test:features` each want a freshly seeded database (`npm run
seed:reset` before each, including between the two). The rest create their own users.

## Where things are

- **Database schema and migrations** — `backend/db/`. Apply `schema.sql`, then `001` through
  `007` in order. Each migration says at the top what it adds and why.
- **Scheduled work** — `backend/jobs/reminderScheduler.js`, started by the server: exercise
  reminders after 3 days without a run, overtraining alerts at 5+ runs in 7 days.
- **Role-based navigation** — `mobile/src/navigation/AppNavigator.js` picks one of four stacks
  (unauthenticated, runner, instructor, admin console) from the account's role.
- **Theme tokens** — `mobile/src/theme/`. Colors adapt to light and dark; use the tokens rather
  than hex values so both keep working.

## Secrets

`.env` is gitignored and must never be committed. `backend/.env.example` holds placeholders
only — copy it, fill your own values in, and generate the JWT secret rather than inventing one:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The same goes for the Google Maps key in `mobile/app.json`, which ships as a placeholder.
