# Going live

Two halves, deployed differently:

- **The backend** runs on a host, with a managed PostgreSQL behind it.
- **The app** is not hosted. It is compiled by EAS Build and either handed round as a file or
  published to the app stores. `npx expo start` is a development tool — nobody can install
  Run League from it.

Do the backend first: the app has to be built with the backend's address baked in, so the
URL has to exist before the build.

---

# Part 1 — the backend

## 1. Create the database

**Neon** is the recommendation for a project like this: the free tier is 3 GiB and does not
expire. Render's own free PostgreSQL **expires 30 days after creation**, which is a bad
surprise in week 5.

1. Sign up at [neon.tech](https://neon.tech), create a project.
2. Copy the connection string. It looks like:

```
postgresql://user:password@ep-something-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Prefer the **pooled** connection string if the provider offers both — it handles many short
connections better, which is what a web API makes.

## 2. Build the tables

### Already have a deployed database?

Then the thing to establish is **which migrations it actually has**, because a database
created before a feature existed will be behind — that is the normal case, not an edge case.
Check before you change anything. `--status` writes nothing (beyond creating an empty
`schema_migrations` bookkeeping table, if it is not there yet):

```powershell
cd backend
$env:DATABASE_URL = "postgresql://...your hosted database..."
npm run migrate:status
```

Three things it can tell you:

| What you see | What it means |
| --- | --- |
| `applied` against all 8 files | Up to date. Nothing to do. |
| `PENDING` against some files | Those are genuinely missing. `npm run migrate` applies just those. |
| `!  006_leaderboard_totals.sql` and similar | **The ledger is lying** — it claims a file ran but the database does not have it. See below. |

That last case is specific and worth explaining, because an earlier version of
`scripts/migrate.js` caused it. Adoption (the step that records pre-existing work so
`schema.sql` is not re-run over the top of itself) used to probe for a single marker and then
record *every* file as applied. Run against a database that predated `006` and `007`, it
produced a ledger listing all eight files while `user_run_totals` and `plan_sessions` had
never been created. Migrating again said "up to date" for ever, and the failure surfaced
instead as the leaderboard and the fitness planner returning 500s in production.

The current script checks each file against its own marker and reconciles the ledger on every
run, so `npm run migrate` repairs that state by itself. If you deployed before this fix,
**run `npm run migrate:status` against your hosted database once** — it is the only way to
find out, and the symptom otherwise shows up as a broken screen rather than a migration error.

Afterwards, clear the variable or close the terminal. While `DATABASE_URL` is set it silently
overrides your `DB_*` settings, and local work will be pointed at production:

```powershell
Remove-Item Env:\DATABASE_URL
```

### A new database

From your own machine, pointed at the hosted database:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://...the string you copied..."
npm run migrate
```

```
  Database: neondb at ep-something-12345.ap-southeast-1.aws.neon.tech
  SSL on · via DATABASE_URL

  applying schema.sql ... done
  applying 001_system_admin.sql ... done
  ...
  Applied 6 files.
```

`npm run migrate:status` lists what has and has not run. Re-running `migrate` is safe — it
records what it has applied in a `schema_migrations` table and does nothing the second time,
so it is fine to run on every deploy.

In fact that is worth doing deliberately. Setting Render's build command to

```
npm install && npm run migrate
```

means the schema can never fall behind the code you just deployed, which is the failure this
page keeps coming back to. The migrations are additive and `IF NOT EXISTS` throughout, so a
deploy that runs them twice costs nothing.

Then create the first admin, and optionally the demo data:

```powershell
npm run admin:create -- you@example.com "a-real-password" "Your Name"
npm run seed          # only if you want the demo accounts in production
```

## 3. Deploy the API

On **Render**: New → Web Service → connect the repository.

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/health` |

Environment variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Neon connection string |
| `JWT_SECRET` | **a new one** — see below |
| `NODE_ENV` | `production` |
| `OAUTH_REDIRECT_BASE` | `https://your-service.onrender.com/api/connections` |

Do **not** set `PORT`; the platform sets it and the server reads it.

Generate a fresh secret rather than reusing your local one — a token signed with a leaked
secret is a valid login:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Check it

```powershell
curl.exe https://your-service.onrender.com/health
curl.exe https://your-service.onrender.com/health/db
```

`/health` says the process is up. **`/health/db` is the one that matters** — it reports
whether the database is actually reachable, and names the host and whether TLS is on:

```json
{ "status": "ok",
  "database": { "via": "DATABASE_URL", "host": "ep-...aws.neon.tech",
                "database": "neondb", "ssl": true } }
```

A `503` there means the API is up but cannot reach its database, and the `error` field says
why. The startup log prints the same thing.

## Things that will bite you

**`DATABASE_URL` wins over the `DB_*` variables.** If both are set, the separate ones are
ignored entirely — no warning, it just connects somewhere else. The startup log says which
one is in use (`via DATABASE_URL` or `via DB_* variables`); check it before assuming the
database is broken.

**TLS is on by default for `DATABASE_URL` and off for `DB_*`.** That is almost always right.
Where it is not, `DB_SSL=true` or `DB_SSL=false` overrides it. Without TLS a hosted database
refuses the connection outright, as `no pg_hba.conf entry for host ..., no encryption`.

**A free instance sleeps.** Render's free tier spins down after 15 minutes idle and takes
about a minute to wake. Hit the URL once before a demo.

**Sleeping breaks the reminder job.** `jobs/reminderScheduler.js` runs inside the server
process at 09:00 daily. On an instance that sleeps, the process is not awake at 09:00 and
the job never runs — exercise reminders and overtraining alerts silently stop. Either run an
always-on instance, or drive it from an external scheduler.

**Connection limits.** A serverless PostgreSQL allows far fewer connections than a local one.
If you scale past one instance, set `DB_POOL_MAX` so instances × pool size stays under the
provider's cap.

---

# Part 2 — the app

## 1. Point it at the deployed backend

`mobile/eas.json` has three profiles. Replace the placeholder URLs with your real one:

```jsonc
"preview":    { "env": { "EXPO_PUBLIC_API_URL": "https://your-service.onrender.com/api" } },
"production": { "env": { "EXPO_PUBLIC_API_URL": "https://your-service.onrender.com/api" } }
```

It must be **https**. iOS blocks plain HTTP by default, and a build pointed at `http://`
fails every request with nothing on screen to explain it.

Expo inlines `EXPO_PUBLIC_*` at build time, so this is fixed when the build is made — change
it and you rebuild. There is deliberately no fallback address in the code: a release build
without this set throws at startup rather than shipping an app that quietly points at
somebody's home network.

## 2. One-time setup

```powershell
cd mobile
npm install -g eas-cli
eas login                  # a free Expo account
eas init                   # writes your EAS project id into app.json
```

## 3. Build

`RELEASE.md` has the full store-release process for both platforms — signing, review, and the
pre-flight check that stops a wasted build. The short version:

```powershell
cd mobile
npm run preflight                                      # until it says "Ready to build"
eas build --platform android --profile preview         # an .apk you can send to anyone
eas build --platform all --profile production          # for the stores
```

The `.apk` from the `preview` profile needs no store account and no review, and it is the only
way to see background GPS and device push — neither works in Expo Go.

## 4. The Google Maps key

Android maps need a key; iOS uses Apple Maps and needs none. Without a key the app runs
normally and the map area is blank — tracking, distance and everything else still work.

Get one from the Google Cloud Console with "Maps SDK for Android" enabled, then **do not
commit it**. `app.config.js` reads it from the environment:

```powershell
# locally, this terminal only
$env:GOOGLE_MAPS_API_KEY = "AIza..."

# for builds
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment production
```

## 5. Background GPS

Recording a run with the phone locked **only works in a build**, never in Expo Go. If you
have been testing tracking in Expo Go and found it stopped at the lock screen, that is why —
and it is the single best reason to make a `preview` build before judging the app.

The build asks for location "all the time" and shows a notification while recording, both of
which the platforms require. Nothing extra to configure: the permissions and background modes
are already in `app.json`.

## 6. Push notifications

The shipped `src/utils/pushNotifications.js` is a deliberate stub, because loading
`expo-notifications` inside Expo Go crashes the app. A real build can use the real one —
`mobile/README.md` has the swap. In-app notifications work either way.

---

## Before you call it live

- [ ] A new `JWT_SECRET`, not the development one
- [ ] A database password that has never been in a chat, a commit, or a screenshot
- [ ] `/health/db` returns `ok` against the deployed API
- [ ] `EXPO_PUBLIC_API_URL` is `https://` and points at the deployed API
- [ ] Signed in from the built app, not just Expo Go
- [ ] Logged a run end to end on a real phone
- [ ] Decided about the reminder job if the instance sleeps
- [ ] `.env` is not in the repository (it is in `.gitignore` — confirm)

Two known gaps worth deciding on before real users, both noted in `backend/README.md`:
there is **no password strength rule** (a single character registers), and `cors()` is open
to any origin, which is harmless for a mobile client but wrong if a website ever uses this API.
