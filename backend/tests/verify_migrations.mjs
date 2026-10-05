/**
 * Verifies that `npm run migrate` correctly catches up a database that already exists.
 *
 *   npm run test:migrations
 *
 * This is the suite that guards deployed data, so it is worth saying what it is for.
 *
 * A database that was created before a migration existed is the normal case once a project
 * is deployed — you add a feature, write `007_plan_sessions.sql`, and the live database has
 * everything up to 006. Migrating has to notice that and apply only what is missing.
 *
 * Two real bugs sat here:
 *
 *   1. Adoption (recording pre-existing work so `schema.sql` is not re-run over the top of
 *      itself) probed for ONE marker, migration 005's `runs.client_run_id`, and then recorded
 *      every file as applied. A database at 004 came out with a ledger listing all eight
 *      files while `user_run_totals` and `plan_sessions` had never been created. Nothing
 *      failed at migrate time; the leaderboard and the planner failed later, in production,
 *      with "relation does not exist" and no hint as to why.
 *
 *   2. Because adoption only runs on an empty ledger, a database already poisoned that way
 *      could not be repaired by migrating again — it reported "up to date" for ever.
 *
 * So: each file is probed for its own marker, and on every run the ledger is reconciled
 * against what the database actually contains. These tests pin both down, from every
 * starting state a deployment can realistically be in.
 *
 * Needs rights to create and drop databases. Skips cleanly without them rather than failing.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(BACKEND, 'db');

const ADMIN_DB = process.env.MIGRATE_TEST_ADMIN_DB || 'postgres';
const HOST = process.env.DB_HOST || 'localhost';
const PORT = process.env.DB_PORT || '5432';
const USER = process.env.DB_USER || process.env.PGUSER || 'postgres';
const PASSWORD = process.env.DB_PASSWORD || process.env.PGPASSWORD || '';

const ALL_FILES = [
  'schema.sql',
  '001_system_admin.sql',
  '002_admin_extensions.sql',
  '003_connected_accounts.sql',
  '004_instructor_credentials.sql',
  '005_run_tracking.sql',
  '006_leaderboard_totals.sql',
  '007_plan_sessions.sql',
];

let passed = 0;
const failures = [];
const ok = (label, cond) => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}`); }
};

const adminPool = new pg.Pool({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: ADMIN_DB });

async function canCreateDatabases() {
  try {
    await adminPool.query('DROP DATABASE IF EXISTS runleague_mig_probe');
    await adminPool.query('CREATE DATABASE runleague_mig_probe');
    await adminPool.query('DROP DATABASE runleague_mig_probe');
    return true;
  } catch {
    return false;
  }
}

/** Apply raw .sql files with no ledger — i.e. a database built before migrate.js existed. */
async function buildDatabase(name, files) {
  await adminPool.query(`DROP DATABASE IF EXISTS ${name}`);
  await adminPool.query(`CREATE DATABASE ${name}`);
  const pool = new pg.Pool({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: name });
  try {
    for (const file of files) {
      const { readFileSync } = await import('node:fs');
      await pool.query(readFileSync(path.join(DB_DIR, file), 'utf8'));
    }
  } finally {
    await pool.end();
  }
}

function runMigrate(name, args = []) {
  return execFileSync(process.execPath, [path.join(BACKEND, 'scripts', 'migrate.js'), ...args], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, DB_NAME: name, DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER,
           DB_PASSWORD: PASSWORD, NODE_ENV: 'test', JWT_SECRET: 'test-only', DATABASE_URL: '' },
  });
}

async function inspect(name) {
  const pool = new pg.Pool({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: name });
  try {
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const ledger = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    const triggers = await pool.query(`SELECT tgname FROM pg_trigger WHERE tgname LIKE '%user_totals%'`);
    return {
      tables: new Set(tables.rows.map((r) => r.table_name)),
      ledger: ledger.rows.map((r) => r.filename),
      triggers: triggers.rows.length,
    };
  } finally {
    await pool.end();
  }
}

/** Whatever the starting point, these must all be true once migrate has run. */
async function assertFullyMigrated(name, label) {
  const { tables, ledger, triggers } = await inspect(name);
  for (const table of ['active_runs', 'user_run_totals', 'plan_sessions', 'plan_weeks']) {
    ok(`${label}: ${table} exists`, tables.has(table));
  }
  ok(`${label}: the user-totals trigger is installed`, triggers >= 1);
  ok(`${label}: the ledger lists all ${ALL_FILES.length} files`, ledger.length === ALL_FILES.length);
  const second = runMigrate(name);
  ok(`${label}: re-running is a no-op`, /up to date/i.test(second));
}

async function main() {
  console.log('\n━━━ migrate: catching up a pre-existing database ━━━');

  if (!(await canCreateDatabases())) {
    console.log(`\n  skip  cannot create databases as "${USER}".`);
    console.log('        Set DB_USER/DB_PASSWORD to a role with CREATEDB and re-run.\n');
    await adminPool.end();
    return;
  }

  // ── every stopping point a deployed database can be at ────────────────────
  for (const stopAt of [4, 5, 6, 7]) {
    const name = `runleague_mig_at00${stopAt}`;
    const files = ALL_FILES.slice(0, stopAt + 1);   // schema.sql + 001..00N
    const missing = ALL_FILES.length - files.length;
    console.log(`\n  a database that stops at 00${stopAt} (${missing} migration${missing === 1 ? '' : 's'} behind)`);

    await buildDatabase(name, files);
    const out = runMigrate(name);
    ok(`00${stopAt}: migrate reported the ${missing} missing file${missing === 1 ? '' : 's'}`,
      missing === 0 ? /up to date/i.test(out) : new RegExp(`Applied ${missing} file`).test(out));
    await assertFullyMigrated(name, `00${stopAt}`);
    await adminPool.query(`DROP DATABASE IF EXISTS ${name}`);
  }

  // ── a genuinely empty database must not adopt anything ────────────────────
  console.log('\n  an empty database');
  const empty = 'runleague_mig_empty';
  await adminPool.query(`DROP DATABASE IF EXISTS ${empty}`);
  await adminPool.query(`CREATE DATABASE ${empty}`);
  const emptyOut = runMigrate(empty);
  ok('empty: nothing is adopted', !/adopted/.test(emptyOut));
  ok('empty: all files are applied', new RegExp(`Applied ${ALL_FILES.length} files`).test(emptyOut));
  await assertFullyMigrated(empty, 'empty');
  await adminPool.query(`DROP DATABASE IF EXISTS ${empty}`);

  // ── the regression: a ledger that lies ────────────────────────────────────
  // This is the state the old adoption logic produced on any database created before 006.
  console.log('\n  a ledger claiming files that the database does not have');
  const lying = 'runleague_mig_lying';
  await buildDatabase(lying, ALL_FILES.slice(0, 6));   // schema.sql + 001..005
  {
    const pool = new pg.Pool({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: lying });
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    for (const file of ALL_FILES) {                    // claim all eight, including 006/007
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
    }
    await pool.end();
  }

  const before = await inspect(lying);
  ok('the lying ledger starts out claiming all eight files', before.ledger.length === 8);
  ok('...while user_run_totals genuinely does not exist', !before.tables.has('user_run_totals'));

  // --status must report the discrepancy and change nothing.
  const status = runMigrate(lying, ['--status']);
  ok('--status names the two files the database does not have',
    /006_leaderboard_totals\.sql/.test(status) && /007_plan_sessions\.sql/.test(status));
  ok('--status shows them as pending', (status.match(/PENDING/g) || []).length === 2);
  const afterStatus = await inspect(lying);
  ok('--status wrote nothing: the ledger is untouched', afterStatus.ledger.length === 8);
  ok('--status wrote nothing: no tables were created', !afterStatus.tables.has('user_run_totals'));

  // Migrating repairs it.
  const repair = runMigrate(lying);
  ok('migrate applies the two missing files', /Applied 2 files/.test(repair));
  await assertFullyMigrated(lying, 'repaired');
  await adminPool.query(`DROP DATABASE IF EXISTS ${lying}`);

  await adminPool.end();
}

main()
  .then(() => {
    console.log(`\n${'─'.repeat(64)}`);
    if (failures.length === 0) console.log(`  ${passed} checks passed, 0 failed`);
    else {
      console.log(`  ${passed} passed, ${failures.length} FAILED`);
      for (const f of failures) console.log(`    - ${f}`);
    }
    console.log(`${'─'.repeat(64)}\n`);
    process.exit(failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('\n  the suite itself failed:', err.message, '\n');
    process.exit(1);
  });
