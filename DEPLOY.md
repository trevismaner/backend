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

# for builds — once per environment you build in
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment preview
eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment production
```

**Both lines matter.** A build runs in the environment its profile names, and `eas.json` now
sets that explicitly (`"environment": "preview"` on the preview profile, and so on). A
variable created only for `production` is not present in a `preview` build — so the `.apk`
you hand round would have no key while the store build did, which is a confusing difference
to debug. Check what is actually there with:

```powershell
eas env:list --environment preview
```

Note that `npm run preflight` **cannot see a key stored in EAS** — the key is injected on the
build worker, and preflight runs on your machine. It reports what it can see locally and says
so, rather than claiming the key is missing.

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
- [ ] Decided whether to require email verification (below)

## Email verification at sign-up

Off by default, which means **anyone can register with an address they do not own**. Fine for
a demo; not what you want with real users. To turn it on you need a mail provider first.

**Resend** ([resend.com](https://resend.com)) is the one to pick on a free host: it is an
HTTPS API, so it works where SMTP ports are blocked — and Render blocks some. Sign up, create
an API key, then on Render:

| Name | Value |
| --- | --- |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `RESEND_API_KEY` | the key |
| `MAIL_FROM` | `Run League <onboarding@yourdomain.com>` |

Any SMTP server works instead via `SMTP_URL`, which needs `npm install nodemailer` — the
dependency is imported only if that variable is set, so it is not otherwise required.

Whatever you pick, check it on its own before turning the flag on:

```powershell
cd backend
npm run mail:test -- you@example.com
```

That sends the real verification template with a dummy code and prints the provider's exact
error if it fails. Worth doing because a broken provider with the flag on looks like a hung
sign-up rather than a mail problem — the person waits for a code that was never sent.

### No domain of your own?

A verified domain is what lets a provider send to *anyone*. Without one you still have
options, in increasing order of effort:

**Leave verification off.** Entirely reasonable for a university project or a demo. The
feature is built and tested either way, and `npm run test:auth` exercises it without any mail
account — that is the deliverable, not a live mailbox. Turn it on when the app has real users.

**Resend's test sender, for your own address only.** `MAIL_FROM` defaults to
`onboarding@resend.dev`, Resend's shared sender. With no domain verified, a provider will
generally only deliver to the address you signed up with — enough to prove the whole flow
works on a real phone using your own email, and not enough for other people. `mail:test` will
tell you exactly which it is for your account.

**A provider that verifies a single address instead of a domain.** Brevo, Mailjet and
SendGrid have all offered this: you confirm one ordinary email address — a Gmail one is fine —
and send from it. That gets you delivery to real recipients with no domain at all. Each
publishes SMTP settings, so it goes in `SMTP_URL` and needs nothing new in the code.

**Gmail over SMTP.** Works, and needs no domain:

```
SMTP_URL=smtps://you@gmail.com:app-password-here@smtp.gmail.com:465
MAIL_FROM=Run League <you@gmail.com>
```

Your normal Google password will not work — turn on 2-step verification and create an **App
Password**. Caveats worth knowing: there is a daily send cap in the low hundreds, mail from a
personal Gmail is more likely to be filtered as spam, and this is fine for a project but not
how you would run a real product. Also note hosts commonly block outbound port 25; 465 and 587
usually work, which is why the URL above uses 465.

**A domain, if you want one.** They are a few dollars a year, and the GitHub Student Developer
Pack has historically included one free for students — worth checking with your UOW email,
since offers change. A verified domain removes every restriction above and is the only route
to mail that reliably reaches strangers.

**Turn the flag on only once a provider is set.** With it on and no provider, sign-up collects
an address and then never delivers a code, which looks like a broken app. The server warns
about exactly that at startup in production, and the startup log always says which mode it is
in (`Email verification required · mail via resend`, or `Email verification off`).

The app reads this from `GET /api/auth/config` at run time rather than being compiled with it,
so switching it on takes effect on phones that already have the app — no rebuild, no review.
That is deliberate: `EXPO_PUBLIC_*` values are frozen into the binary, and this should not be.

One gap left, noted in `backend/README.md`: `cors()` is open to any origin. Harmless for a
mobile client, wrong if a website ever uses this API.
