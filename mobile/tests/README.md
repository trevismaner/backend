# Mobile tests

## render_all_screens.cjs

Mounts every screen with `react-test-renderer` against a running backend, then presses
real buttons and checks the server actually changed. It catches what static checks cannot:
render-time crashes, bad hooks, a `renderItem` that throws, a screen that renders but shows
nothing because it read the wrong field off the response.

Only `react-native` and the native modules are mocked (see `mocks/`) — the screens,
controllers and entities are the real files.

### Running it

```bash
# 1. a backend + database must be up (see ../../backend/README.md)
#    the harness seeds its own user, runs, plan, group, event and posts
npm install -D react-test-renderer@19.2.3 @babel/register @babel/core @babel/preset-env @babel/preset-react

# 2. run it
node tests/render_all_screens.cjs
```

`TEST_URL` overrides the API base (default `http://localhost:3000/api`) and `TEST_DB`
the database name used for the two role-promotion statements (default `run_league_verify`).

`react-test-renderer` must match the `react` version in package.json **exactly**, and must be
pinned without a caret. Two separate things go wrong otherwise:

- At runtime, the screens' hooks run against a second React copy and every mount fails.
- At build time, `npm ci --include=dev` refuses to install at all. Not hypothetical: a
  `"^19.2.3"` range floated to `19.3.0`, whose `peer react@^19.3.0` cannot be met by the
  `react@19.2.3` that Expo SDK 57 pins, and an EAS build died on it. `npm run check:deps`
  catches that class of conflict offline, before a build is spent on it.

## api_integration.mjs

Probes `src/api/client.js` at its edges, against a running backend: a non-JSON error page,
an empty body, an unreachable server, a rejected token, a request that never returns, and
whether every endpoint's error body matches the shape the client reads.

It loads the **real** client file and swaps only the AsyncStorage import (that module cannot
load outside React Native), so the logic under test is what ships.

```bash
node tests/api_integration.mjs
```

Add `_client_under_test.mjs` and `_client_short.mjs` to `.gitignore` — the probe writes
those temporary copies as it runs.

## peer_deps.test.mjs

Tests `scripts/checkPeerDeps.mjs`, the pre-build check that reads `package-lock.json` and
reports anything that would fail `npm ci --include=dev` — the first command an EAS worker
runs, and so the earliest and cheapest way a build can die.

That check does its own semver range matching rather than importing the `semver` package,
because `semver` is only ever present here transitively: a check that imported it would
silently stop working whenever it ran before `npm install`, printing *nothing would fail*
without having looked. A green result that did no work is the worst outcome for a check whose
whole job is to save a build, so it matches ranges itself and counts anything it cannot parse
as unchecked rather than as passing.

The price of that choice is that the matching has to be proved, so this suite compares it
against the real `semver` on **every** range/version pair in the lockfile — currently 209,
all agreeing — plus a battery of awkward synthetic ones: `0.x` carets (`^0.0.2` means
`<0.0.3`, which is where this matcher first got it wrong), `||` alternatives, x-ranges,
prereleases, and operators written with a space (`>= 3.0.0`, which several
`@react-navigation` packages use).

Needs no server and no database.

```bash
npm run test:deps      # the suite
npm run check:deps     # just the check, as preflight runs it
```
