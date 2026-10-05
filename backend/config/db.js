import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * The PostgreSQL connection pool, for either a local database or a hosted one.
 *
 * Two ways to point it at a database, checked in this order:
 *
 *   1. DATABASE_URL — a single connection string. This is what every hosted provider hands
 *      you (Neon, Render, Supabase, Railway, Heroku), so it is what deployment uses.
 *   2. DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD — the separate variables, which
 *      is how local development has always worked and still works, unchanged.
 *
 * Nothing else in the codebase cares which was used.
 */

const connectionString = process.env.DATABASE_URL?.trim() || null;

/**
 * `rejectUnauthorized: false` accepts the provider's certificate without checking it against
 * a local root store. That is the normal setting for managed PostgreSQL, whose certificates
 * are often signed by a provider CA that Node does not ship: the connection is still
 * encrypted, the chain simply is not verified.
 *
 * To verify it properly — worth doing when the provider publishes a CA bundle — put the PEM
 * in DB_CA_CERT and the chain is checked against that instead.
 */
function sslOptions() {
  const ca = process.env.DB_CA_CERT?.trim();
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Whether to open the connection over TLS.
 *
 * Hosted PostgreSQL requires it — without it the handshake is refused, usually as
 * `no pg_hba.conf entry for host ..., no encryption`. A local PostgreSQL normally has no
 * certificate at all, so TLS has to stay off there.
 *
 * The default follows the connection style: a DATABASE_URL means hosted, so SSL on. Set
 * DB_SSL=true or false when that guess is wrong — a local database reached by URL, or a
 * hosted one reached over a private network.
 */
function sslSetting() {
  const explicit = process.env.DB_SSL?.trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(explicit)) return false;
  if (['true', '1', 'on', 'yes'].includes(explicit)) return sslOptions();

  // `sslmode=` in the URL is the provider's own instruction, so respect it.
  if (connectionString && /[?&]sslmode=disable/i.test(connectionString)) return false;
  if (connectionString) return sslOptions();

  return false; // separate DB_* variables: local development
}

const ssl = sslSetting();

/**
 * Pool sizing and timeouts.
 *
 * A serverless PostgreSQL (Neon, Supabase) allows far fewer connections than a dedicated
 * server, and a free tier fewer still, so pg's default of 10 per instance is too many once
 * more than one instance runs. DB_POOL_MAX tunes it per environment.
 *
 * The timeouts matter once the database is across a network: a connection that cannot be
 * established should fail the request rather than hang it, and an idle one should be
 * released so a database that scales to zero is allowed to.
 */
const shared = {
  ssl,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(
  connectionString
    ? { connectionString, ...shared }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ...shared,
      }
);

/**
 * An error on an idle connection is logged, not fatal.
 *
 * This used to call process.exit(-1), which is wrong anywhere but a local machine. Managed
 * databases drop idle connections as a matter of course — Neon scales to zero, providers
 * recycle connections, networks blip — and every one of those would have taken the whole
 * server down with it. On a platform that restarts a crashed process, that is a restart loop.
 *
 * The pool discards the broken connection itself and opens a fresh one for the next query,
 * so there is nothing to do here but say so.
 */
pool.on('error', (err) => {
  console.error('Database pool error (the connection will be replaced):', err.message);
});

/** Where this process is connected, with the password left out. Safe to log or serve. */
export function describeConnection() {
  if (connectionString) {
    try {
      const url = new URL(connectionString);
      return {
        via: 'DATABASE_URL',
        host: url.hostname,
        database: url.pathname.replace(/^\//, '') || null,
        ssl: ssl !== false,
      };
    } catch {
      return { via: 'DATABASE_URL', host: null, database: null, ssl: ssl !== false };
    }
  }
  return {
    via: 'DB_* variables',
    host: process.env.DB_HOST ?? null,
    database: process.env.DB_NAME ?? null,
    ssl: ssl !== false,
  };
}

/** One round trip, to prove the database is genuinely reachable rather than just configured. */
export async function checkConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

export default pool;
