/**
 * Applies the schema and every migration, in order, to whatever database the environment
 * points at — local or hosted.
 *
 *   npm run migrate            apply anything not yet applied
 *   npm run migrate -- --status   list what has and has not run, change nothing
 *   npm run migrate -- --dry-run  show what would run, change nothing
 *
 * Why this exists: deploying meant running six psql commands by hand against a remote host,
 * in the right order, and keeping track of which had already been done. Getting that wrong
 * is how a database ends up half-migrated, which shows up later as
 * `column "client_run_id" does not exist` rather than as anything obviously migration-shaped.
 *
 * What has run is recorded in a `schema_migrations` table, so this is safe to run on every
 * deploy: the second run does nothing. Each file is applied inside a transaction, so a
 * migration that fails part way leaves nothing behind.
 *
 * It goes through config/db.js, so it gets DATABASE_URL and SSL for free — no separate psql
 * on the PATH, which matters on a platform where there is no shell.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { describeConnection } from '../config/db.js';

const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes('--status');
const DRY_RUN = args.includes('--dry-run');

const log = (msg) => console.log(`  ${msg}`);

/**
 * schema.sql first, then the numbered migrations in filename order.
 *
 * Discovered from the directory rather than hardcoded, so adding 006 means dropping the file
 * in and nothing else. Zero-padded names sort correctly, which is why they are numbered.
 */
async function migrationFiles() {
  const entries = await readdir(DB_DIR);
  const numbered = entries.filter((name) => /^\d{3}_.*\.sql$/.test(name)).sort();
  const base = entries.includes('schema.sql') ? ['schema.sql'] : [];
  return [...base, ...numbered];
}

async function ensureLedger() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(200) PRIMARY KEY,
      applied_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function alreadyApplied() {
  const result = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

/**
 * How to tell, by looking at the database, whether a given file has already run.
 *
 * Every file gets its own marker. An earlier version of this probed only migration 005 and
 * then adopted the whole list, which silently marked 006 and 007 as applied on any database
 * created before they existed — the ledger said "up to date" while `user_run_totals` and
 * `plan_sessions` had never been created, so the leaderboard and the planner failed in
 * production with nothing in the migration output to suggest why. A deployed database that
 * predates a migration is the normal case, not the edge case, so each one is checked.
 *
 * Markers are chosen to be the thing the file creates last-ish and that nothing else makes.
 */
const MARKERS = {
  'schema.sql':                    { table: 'users' },
  '001_system_admin.sql':          { table: 'admin_audit_logs' },
  '002_admin_extensions.sql':      { table: 'admin_audit_logs', column: 'target_type' },
  '003_connected_accounts.sql':    { table: 'connected_wearables', column: 'provider_user_id' },
  '004_instructor_credentials.sql':{ table: 'users', column: 'credential_qualification' },
  '005_run_tracking.sql':          { table: 'active_runs' },
  '006_leaderboard_totals.sql':    { table: 'user_run_totals' },
  '007_plan_sessions.sql':         { table: 'plan_sessions' },
};

async function markerPresent(filename) {
  const marker = MARKERS[filename];
  if (!marker) return false;   // an unknown file is never assumed to have run

  if (marker.column) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [marker.table, marker.column]
    );
    return rows[0].n > 0;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [marker.table]
  );
  return rows[0].n > 0;
}

/**
 * A database that predates this script has its tables but an empty ledger, so a plain run
 * would try to apply schema.sql over the top of itself (it is the one file without
 * IF NOT EXISTS everywhere). Record as applied only the files whose work is actually
 * present; everything else is left for the normal run to apply.
 */
async function adoptExistingDatabase(files, applied, { dryRun = false } = {}) {
  if (applied.size > 0) return false;
  if (!(await markerPresent('schema.sql'))) return false; // genuinely empty: migrate normally

  log('This database already has tables but no migration ledger.');
  log(dryRun
    ? 'Checking which files have actually run (nothing will be written).'
    : 'Checking which files have actually run, and recording just those.');

  const pending = [];
  for (const filename of files) {
    if (await markerPresent(filename)) {
      // `--status` must not touch a production ledger, so it only reports.
      if (!dryRun) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [filename]);
      }
      applied.add(filename);
      log(`  ${dryRun ? 'present' : 'adopted'}  ${filename}`);
    } else {
      pending.push(filename);
    }
  }

  if (pending.length > 0) {
    log(`  ${pending.length} file${pending.length === 1 ? '' : 's'} not yet in this database`
      + `${dryRun ? '.' : ' — applying below.'}`);
  }
  return !dryRun;
}

/**
 * Catch a ledger that claims a file ran when the database shows otherwise.
 *
 * This is not paranoia about the general case — an earlier version of this script created
 * exactly that state. It probed only migration 005 and then recorded every file as applied,
 * so a database that predated 006 and 007 ended up with a ledger listing all eight files
 * while `user_run_totals` and `plan_sessions` did not exist. `migrate:status` then reported
 * "up to date" and the leaderboard and planner failed at runtime with nothing to point at.
 *
 * Adoption alone cannot fix that, because adoption only runs on an empty ledger. So on every
 * run, each file the ledger claims is checked against its marker and re-applied if the work
 * is genuinely absent. Every numbered migration is written with IF NOT EXISTS throughout, so
 * re-applying one is safe. `schema.sql` is never re-applied this way: it is the one file that
 * is not idempotent, and its marker missing would mean an empty database, which adoption
 * already handles.
 */
async function reconcileLedger(files, applied, { dryRun = false } = {}) {
  const wrong = [];
  for (const filename of files) {
    if (!applied.has(filename)) continue;
    if (filename === 'schema.sql') continue;
    if (!MARKERS[filename]) continue;
    if (!(await markerPresent(filename))) wrong.push(filename);
  }
  if (wrong.length === 0) return false;

  log(`The ledger lists ${wrong.length} file${wrong.length === 1 ? '' : 's'} that this database does not actually have:`);
  for (const filename of wrong) log(`  !  ${filename}`);

  if (dryRun) {
    // `--status` reports and changes nothing; the entries are only dropped from the
    // in-memory set so the listing below shows them as pending, which is the truth.
    log('Run `npm run migrate` to apply them.');
    for (const filename of wrong) applied.delete(filename);
    return false;
  }

  log('Clearing those entries so they are applied properly below.');
  await pool.query('DELETE FROM schema_migrations WHERE filename = ANY($1::text[])', [wrong]);
  return true;
}

async function applyOne(filename) {
  const sql = await readFile(path.join(DB_DIR, filename), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const connection = describeConnection();
  console.log('');
  log(`Database: ${connection.database ?? '(unnamed)'} at ${connection.host ?? '(unset)'}`);
  log(`SSL ${connection.ssl ? 'on' : 'off'} · via ${connection.via}`);
  console.log('');

  const files = await migrationFiles();
  if (files.length === 0) throw new Error(`No .sql files found in ${DB_DIR}`);

  await ensureLedger();
  let applied = await alreadyApplied();

  if (await adoptExistingDatabase(files, applied, { dryRun: STATUS_ONLY })) {
    applied = await alreadyApplied();
  }

  if (await reconcileLedger(files, applied, { dryRun: STATUS_ONLY })) {
    applied = await alreadyApplied();
  }

  const pending = files.filter((f) => !applied.has(f));

  if (STATUS_ONLY) {
    console.log('');
    for (const f of files) log(`${applied.has(f) ? 'applied' : 'PENDING'}  ${f}`);
    console.log('');
    log(`${applied.size} applied, ${pending.length} pending`);
    console.log('');
    return;
  }

  if (pending.length === 0) {
    log('Already up to date — nothing to apply.');
    console.log('');
    return;
  }

  if (DRY_RUN) {
    console.log('');
    for (const f of pending) log(`would apply  ${f}`);
    console.log('');
    return;
  }

  for (const filename of pending) {
    process.stdout.write(`  applying ${filename} ... `);
    await applyOne(filename);
    console.log('done');
  }

  console.log('');
  log(`Applied ${pending.length} file${pending.length === 1 ? '' : 's'}.`);
  console.log('');
}

try {
  await main();
} catch (err) {
  console.error('');
  console.error(`  Migration failed: ${err.message}`);
  if (/no pg_hba\.conf entry|no encryption|SSL/i.test(err.message)) {
    console.error('  That looks like a TLS problem. Hosted databases need SSL — set DB_SSL=true,');
    console.error('  or use the DATABASE_URL the provider gave you (SSL is then on by default).');
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(err.message)) {
    console.error('  The database could not be reached at all. Check the host, the port, and');
    console.error('  whether this machine is allowed to connect to it.');
  }
  console.error('');
  process.exitCode = 1;
} finally {
  await pool.end();
}
