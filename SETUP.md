# Running Run League from scratch

A complete walkthrough on a Windows PC with nothing installed yet. Every command is
PowerShell. Allow about 30 minutes the first time, most of it downloads.

`README.md` has the condensed version once you have done this once.

---

## What you need first

| | Version | Where | Notes |
| --- | --- | --- | --- |
| **Node.js** | 20 LTS or newer | [nodejs.org](https://nodejs.org) — take the LTS installer | Tick "Add to PATH" (the default) |
| **PostgreSQL** | 14 or newer (16 is fine) | [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) | **Write down the password** you set for the `postgres` user — you need it in step 4 |
| **Expo Go** | latest | App Store / Google Play, on your phone | Only if you want to run the app on a real phone, which is the easy path |

Your phone and your PC must be on the **same Wi-Fi network**.

### Check they installed

Open a **new** PowerShell window (a new one — PATH changes do not reach windows that were
already open) and run:

```powershell
node --version      # v20.x.x or higher
npm --version        # 10.x.x or higher
psql --version       # psql (PostgreSQL) 16.x
```

If `node` works but `psql` says *"not recognized"*, PostgreSQL installed but did not go on
PATH. Either add `C:\Program Files\PostgreSQL\16\bin` to PATH (System Properties →
Environment Variables → Path → New), open a new PowerShell window, and try again — or prefix
every `psql` command below with the full path:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" --version
```

### If PowerShell refuses to run scripts

`npm` is a script, so a locked-down PowerShell blocks it:

> *cannot be loaded because running scripts is disabled on this system*

Fix it once, for your user only:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y`. This allows local scripts and signed remote ones; it does not disable security.

---

## 1. Unpack the project

Extract the zip somewhere **without spaces or OneDrive sync** in the path. `C:\dev\` is a good
choice; `C:\Users\you\OneDrive\Documents\` causes file-locking problems with `node_modules`.

```powershell
cd C:\dev\run-league
ls
```

You should see exactly three things — if you see `backend` and `mobile` nested inside another
`run-league` folder, go one level deeper:

```
README.md    SETUP.md    backend    mobile
```

> **Every command below assumes you are in `C:\dev\run-league`** unless it says otherwise.
> If a command fails with `ENOENT: no such file or directory, open '...\package.json'`, you are
> in the wrong folder. Run `pwd` to see where you are.

---

## 2. Create the database

```powershell
createdb -U postgres run_league
```

It will prompt for the `postgres` password you set during installation. If `createdb` is not
on PATH, use `psql -U postgres -c "CREATE DATABASE run_league"` instead.

---

## 3. Build the tables

The schema comes first, then five migrations **in numerical order**. `Sort-Object Name`
matters — `Get-ChildItem` does not guarantee order on its own, and these are not
order-independent.

```powershell
psql -U postgres -d run_league -f backend\db\schema.sql
Get-ChildItem backend\db\0*.sql | Sort-Object Name | ForEach-Object {
  psql -U postgres -d run_league -f $_.FullName
}
```

**You should see** a long stream of `CREATE TABLE` / `CREATE INDEX`, with `schema.sql` ending
on two inserts — the 4 starter rewards and 5 badges:

```
CREATE INDEX
INSERT 0 4
INSERT 0 5
```

Then each migration in turn, finishing with `007_plan_sessions.sql`:

```
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
```

(A `NOTICE: ... does not exist, skipping` on a first run is expected — the migrations drop
before creating so they can be re-run.)

Confirm you ended up with 27 tables:

```powershell
psql -U postgres -d run_league -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
```

> If a later step fails with `relation "admin_audit_logs" does not exist` or
> `column "client_run_id" does not exist`, a migration did not apply. Re-run the loop above —
> every migration is written to be safe to run twice.

---

> **A shorter way, once step 4 is done:** `npm run migrate` applies the schema and every
> migration in order, records what it has run, and is safe to repeat — so you never have to
> work out which files are outstanding. It needs `.env` configured first, which is why the
> psql commands above come first on a cold start. `npm run migrate:status` lists what has and
> has not been applied.

## 4. Configure and install the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
notepad .env
```

`npm install` prints a few `npm warn deprecated` lines about `uuid` — that is normal and
nothing is wrong.

In Notepad, change **two** values, save, and close:

- `DB_PASSWORD=your_postgres_password` → your actual postgres password
- `JWT_SECRET=generate_your_own_see_comment_above` → a real random string

Generate the secret rather than inventing one, and paste the output in:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave everything else alone. `DB_USER=postgres` and `DB_NAME=run_league` already match what
you created. The provider credentials further down stay empty — those features report
themselves as unavailable until filled in, which is the intended state.

> `.env` holds your real password and must never be committed or shared. It is already in
> `.gitignore`. `.env.example` is the shareable template and contains only placeholders.

---

## 5. Fill it with demo data

Optional, but it means every screen has something in it and you can log in as each role
without creating anything by hand.

```powershell
npm run seed
```

**You should see:**

```
  Seeded: 8 users · 29 runs · 3 groups · 3 tournaments
          2 public events · 3 posts · 8 notifications

  Every account's password is:  Password123
```

followed by the eight accounts. All of them use **`Password123`**:

| Account | Email | What it shows you |
| --- | --- | --- |
| System admin | `admin@runleague.test` | the admin console |
| Instructor (verified) | `coach@runleague.test` | can publish to the instructor board |
| Instructor (unverified) | `newcoach@runleague.test` | blocked until verified |
| Runner — active | `alice@runleague.test` | 12 runs, a group she administers, 3 tournaments, a plan |
| Runner — top of board | `ben@runleague.test` | 16 runs, a claimed reward |
| Runner — returning | `chloe@runleague.test` | 1 run, a risk assessment |
| Runner — brand new | `dan@runleague.test` | no runs — shows the empty states |
| Runner — suspended | `suspended@runleague.test` | login is refused with 403 |

**`alice@runleague.test` is the one to start with.** `dan@runleague.test` is worth a look
afterwards to see how the app behaves with no data.

---

## 6. Start the backend

```powershell
npm run dev
```

**You should see:**

```
Run League backend running on http://localhost:3000
Reminder scheduler started (runs daily at 09:00 server time)
```

**Leave this window running.** `npm run dev` restarts the server whenever you edit a file.

In a **second** PowerShell window, check it answers:

```powershell
curl.exe http://localhost:3000/health
```

→ `{"status":"ok"}`

Use `curl.exe`, not `curl` — in PowerShell, plain `curl` is an alias for `Invoke-WebRequest`
and takes different arguments.

Now check the database is really wired up, by logging in:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:3000/api/auth/login -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"alice@runleague.test","password":"Password123"}'
$login.user.name        # Alice Tan
```

If that returns a name, the server, the database and the seed data are all working. If it
says *"Incorrect email or password"*, the seed did not run — go back to step 5.

---

## 7. Install and start the app

In the second window:

```powershell
cd ..\mobile
npm install
```

This one takes longer — about 820 packages. You will see `npm warn deprecated` lines for
`@react-navigation/*` and a vulnerability count at the end.

> **Do not run `npm audit fix --force`.** It upgrades React Navigation from v6 to v7, whose
> API is different, and the app stops building. The reported issues are all in transitive
> development dependencies and do not affect the running app. Leave them.

Now point the app at your PC. Find your IP:

```powershell
ipconfig
```

Look for your **Wi-Fi** adapter and take the **IPv4 Address** — something like
`192.168.1.42`. Then:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.42:3000/api"
npx expo start
```

Use your own IP, not that example. The variable stays set for the rest of this PowerShell
window, so set it once per window, not once per command.

| Where you are running it | What to use |
| --- | --- |
| Real phone via Expo Go | your PC's IPv4 address, as above |
| Android emulator | `http://10.0.2.2:3000/api` |
| iOS simulator (Mac only) | `http://localhost:3000/api` |

**Scan the QR code with Expo Go** on your phone. That is the whole step.

> **Do not press `a`.** That launches an Android emulator and needs Android Studio plus the
> Android SDK on PATH; without them it fails with *"Failed to resolve the Android SDK path"*
> and *"adb is not recognized"*. Scanning the QR code needs neither. Press `r` to reload the
> app, and start with `npx expo start -c` if you ever need to clear Metro's cache.

---

## 8. Look around

Sign in as `alice@runleague.test` / `Password123`. Worth visiting:

- **Dashboard** — this week's real distance, the bars per day with today highlighted, and her
  live risk score.
- **Start a Run** — real GPS tracking. Walk around outside and the distance climbs and the
  route draws. It checkpoints to the server every 20 seconds, so force-closing the app and
  reopening it offers the run back instead of losing it.
- **Run history → any run** — rename it, correct the distance (the points move with it), or
  delete it.
- **Tournament** → a completed one — standings with times as `1:25:12`, and a button to record
  results.
- Sign out and back in as `admin@runleague.test` for the admin console, or
  `coach@runleague.test` for the instructor side. The app picks a different set of screens per
  role.

---

## 9. Running the tests

### The quick check — about a minute

From `backend`, with the server running:

```powershell
npm run test:tracking
```

→ `80 passed, 0 failed`. This one creates its own accounts, so it does not care what is
already in the database.

### The full run

Twelve suites, 682 checks. Two things decide whether they pass, and both catch people out.

**First: start the server with `NODE_ENV=test`.** The API is rate limited — 300 requests a
minute, and 20 *failed* sign-ins per 15 minutes. One suite stays under that; ten of them back
to back do not, and `test:e2e` tries bad passwords on purpose. The limits are skipped when
`NODE_ENV=test` and active otherwise, so without this you get a few passes and then a wall of
failures that look like broken code:

```powershell
# in the backend window, instead of plain `npm run dev`
$env:NODE_ENV = "test"
npm run dev
```

The giveaway is an expected `201` or `200` arriving as **`429`**, and every later check in that
suite failing with `Cannot read properties of undefined (reading 'token')` — the sign-in that
should have produced the token was the request that got refused.

Use a fresh window, or set `$env:NODE_ENV = "development"` and restart, before you go back to
using the app, so you are not browsing with the limits switched off.

**Second: the suites fall into two groups by what the database has to look like**, and mixing
the two up is the other main reason a suite fails on a working project:

- **Group A** wants a **freshly seeded** database. These count rows exactly, so anything else
  that has run first breaks them.
- **Group B** wants an **empty** database with one admin. These also count exactly, and seeded
  data breaks them.

So use two databases. Neither should be the one you browse the app with.

#### Group A — on the seeded database

```powershell
cd backend
npm run test:weather        # 24 passed  — needs no server and no database at all

npm run seed:reset
npm run test:seed           # 62 passed

npm run seed:reset          # yes, again — test:seed renames a user and resets a password
npm run test:features       # 46 passed

npm run test:tracking       # 80 passed  — creates its own accounts, so it goes last
npm run test:planner        # 56 passed  — the fitness planner, with a stub provider
npm run test:migrations     # 55 passed  — needs no server; creates and drops its own databases
```

`test:migrations` checks that migrating catches up a database that predates a migration —
the situation any deployed database is in after you add a feature. It needs a postgres role
with `CREATEDB` and skips cleanly without one.

`test:tracking` adds 4 users and 8 runs. Run it before `test:seed` and you will see
`59 passed, 3 failed` on the row counts — nothing is broken, the data just moved.

#### Group B — on an empty test database

```powershell
createdb -U postgres run_league_test
psql -U postgres -d run_league_test -f db\schema.sql
Get-ChildItem db\0*.sql | Sort-Object Name | ForEach-Object {
  psql -U postgres -d run_league_test -f $_.FullName
}
```

Point `.env` at it — `DB_NAME=run_league_test` — **restart the server**, and create its admin:

```powershell
npm run admin:create -- admin@uow.edu.au Password123 "Sys Admin"
```

`test:stories` and the render harness also reach the database directly with `psql`, so it has
to be on PATH and the credentials have to be in the environment:

```powershell
$env:PGUSER = "postgres"; $env:PGPASSWORD = "your_password"; $env:PGHOST = "localhost"
$env:TEST_DB = "run_league_test"      # must match DB_NAME in .env

npm run test:e2e            # 11 pass, 0 fail
npm run test:stories        # PASS 82, FAIL 0  (2 are out-of-app by design)

cd ..\mobile
node tests\render_all_screens.cjs   # 91 passed — mounts every screen, presses real buttons
node tests\api_integration.mjs      # 11 checks passed
npm run test:deps                   # 104 passed — needs no server and no database
```

Run `test:e2e` against the seeded database by mistake and you get `4 pass, 7 fail` — it expects
5 users and finds 12.

`npm run test:connections` is the ninth suite (60 checks). It drives the OAuth handshake
against a stub provider on port 4901, which needs the server started with stub Fitbit
credentials — `backend/README.md` has that block.

#### Afterwards

Point `.env` back at `DB_NAME=run_league` and restart the server, or the app will be talking
to the empty test database and every screen will look broken.

---

## Troubleshooting

| What you see | What it means |
| --- | --- |
| `cannot be loaded because running scripts is disabled` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer `Y`. |
| `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'` (or any other) | `npm install` has not been run, or was run before a dependency was added. Run `npm install` in `backend` (and in `mobile` for its own). `node_modules` is not in the download — it is hundreds of megabytes and is rebuilt from `package.json`. |
| `ENOENT: no such file or directory, open '...\package.json'` | Wrong folder. `npm` commands run inside `backend` or `mobile`, never the project root or your Downloads folder. `pwd` shows where you are. |
| `'psql' is not recognized` / `'createdb' is not recognized` | PostgreSQL is not on PATH. Add `C:\Program Files\PostgreSQL\16\bin`, open a **new** PowerShell window, or use the full path to `psql.exe`. |
| `'node' is not recognized` after installing Node | Open a new PowerShell window — PATH changes do not reach already-open ones. |
| `connection to server at "localhost" ... failed: Connection refused` | PostgreSQL is not running. Open Services (`services.msc`) and start `postgresql-x64-16`. |
| `password authentication failed for user "postgres"` | `DB_PASSWORD` in `backend\.env` does not match your postgres password. |
| `relation "admin_audit_logs" does not exist` | Migrations did not all apply. Re-run the step-3 loop; they are safe to repeat. |
| `column "client_run_id" does not exist` | Migration `005_run_tracking.sql` is missing. Run it. |
| `relation "user_run_totals" does not exist` | Migration `006_leaderboard_totals.sql` is missing. Run it. |
| `EADDRINUSE: address already in use :::3000` | A server is already running. Either use it, or find and stop it: `Get-NetTCPConnection -LocalPort 3000 \| Select-Object -Expand OwningProcess \| ForEach-Object { taskkill /PID $_ /F }` |
| `Cannot find package 'bcrypt'` | You have an older copy of a file that imports `bcrypt`. This project uses **`bcryptjs`** — a pure-JavaScript build with no compiler step. Re-extract from the zip. |
| `node-gyp rebuild` failing, or `install scripts not yet covered` | Something is trying to build native `bcrypt`. Same answer: this project uses `bcryptjs` and needs no build tools. |
| `[runtime not ready] Error` / red screen on app launch | An older copy with the push-notification problem. The shipped `src/utils/pushNotifications.js` is a stub that avoids it. Re-extract, then `npx expo start -c`. |
| `Failed to resolve the Android SDK path` / `adb is not recognized` | You pressed `a`. Scan the QR code with Expo Go instead. |
| App opens but every screen is empty, or sign-in fails | The app cannot reach the backend. Check `EXPO_PUBLIC_API_URL` has your real IP (not `localhost`), both devices are on the same Wi-Fi, the backend window is still running, and Windows Firewall is not blocking Node — allow it on private networks when prompted. |
| Text invisible, white on white | An older copy. Fixed in `src/theme/colors.js`; re-extract. |
| `test:seed` or `test:features` failing on counts | They need a freshly seeded database. `npm run seed:reset` first, including between the two. |
| `test:e2e` giving `4 pass, 7 fail` | It is pointed at the seeded database. It needs an empty one — see Group B above. |
| Suites pass individually but fail when run together | Two causes, both above. Either the server is not in `NODE_ENV=test` and the rate limiter is refusing requests (`429`), or Group A and Group B are mixed up. |
| A test expecting `200` or `201` gets **`429`** | The rate limiter. Restart the server with `$env:NODE_ENV = "test"`. |
| `npm ci` fails with `ERESOLVE` / `Conflicting peer dependency` | Two packages disagree about a version. Run `npm run check:deps` in `mobile` — it names the pair and what to pin. This is also what fails an EAS build in its first minute. |
| Map area blank on Android, everything else fine | `mobile\app.json` has a placeholder Google Maps key. Get a free one from the Google Cloud Console (enable "Maps SDK for Android") and paste it in. iOS uses Apple Maps and needs no key. |

---

## Everyday use, after the first time

```powershell
# window 1
cd C:\dev\run-league\backend
npm run dev

# window 2
cd C:\dev\run-league\mobile
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.42:3000/api"
npx expo start
```

To wipe the data and start over with fresh demo accounts:

```powershell
cd C:\dev\run-league\backend
npm run seed:reset
```

To stop: `Ctrl+C` in each window.
