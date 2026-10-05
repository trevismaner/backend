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
 * A database that predates this script has its tables but an empty ledger, so a plain run
 * would try to apply schema.sql over the top of itself. When the tables are already there,
 * the existing files are recorded as applied rather than re-run.
 */
async function adoptExistingDatabase(files, applied) {
  if (applied.size > 0) return false;

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'users'`
  );
  if (rows[0].n === 0) return false; // genuinely empty: migrate normally

  log('This database already has tables but no migration ledger.');
  log('Recording the existing files as applied rather than running them again.');

  // 005 is the most recent column-adding migration; if its column is missing the database
  // is mid-way through, so leave that one to be applied properly below.
  const { rows: tracking } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
     WHERE table_name = 'runs' AND column_name = 'client_run_id'`
  );
  const upTo = tracking[0].n > 0 ? files : files.filter((f) => !f.startsWith('005_'));

  for (const filename of upTo) {
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [filename]);
    log(`  adopted  ${filename}`);
  }
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

  if (await adoptExistingDatabase(files, applied)) {
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
