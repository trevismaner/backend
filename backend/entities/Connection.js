import crypto from 'node:crypto';
import pool from '../config/db.js';

/**
 * A user's link to an outside service — a wearable (RU-16) or a social platform (RU-49).
 *
 * The two live in different tables with different column names for the provider, so this
 * class hides that difference behind one shape. Tokens never leave this file: `toJSON()`
 * reports whether a connection exists and when it was made, never the token itself.
 */

const TABLES = {
  wearable: { table: 'connected_wearables', column: 'provider', id: 'wearable_id' },
  social: { table: 'connected_social_accounts', column: 'platform', id: 'social_id' },
};

// The handshake is abandoned if the user does not finish it in this long.
const STATE_TTL_MINUTES = 15;

class Connection {
  constructor(row, kind) {
    const meta = TABLES[kind];
    this.kind = kind;
    this.connectionId = row[meta.id];
    this.userId = row.user_id;
    this.provider = row[meta.column];
    this.scope = row.scope ?? null;
    this.providerUserId = row.provider_user_id ?? null;
    this.expiresAt = row.expires_at ?? null;
    this.connectedAt = row.connected_at;
    this.lastSyncedAt = row.last_synced_at ?? null;
    this.lastSyncError = row.last_sync_error ?? null;
    // held in memory for the sync path; never serialised
    this.accessToken = row.access_token;
    this.refreshToken = row.refresh_token ?? null;
  }

  /** Safe to send to the app — no tokens. */
  toJSON() {
    return {
      provider: this.provider,
      kind: this.kind,
      connected: true,
      connectedAt: this.connectedAt,
      scope: this.scope,
      expiresAt: this.expiresAt,
      // a connection whose token has expired and cannot be refreshed needs reconnecting
      expired: this.expiresAt ? new Date(this.expiresAt) <= new Date() && !this.refreshToken : false,
      lastSyncedAt: this.lastSyncedAt,
      lastSyncError: this.lastSyncError,
    };
  }

  // ── the OAuth handshake ──

  /**
   * Creates the one-time `state` that ties a callback back to the user who started it.
   * Without this, anyone could hand a victim a callback URL and attach their own account.
   */
  static async createState({ userId, provider, kind, redirectTo = null }) {
    const state = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      `INSERT INTO oauth_states (state, user_id, provider, kind, redirect_to)
       VALUES ($1, $2, $3, $4, $5)`,
      [state, userId, provider, kind, redirectTo]
    );
    return state;
  }

  /** Consumes a state exactly once, and only if it is recent. */
  static async consumeState(state) {
    const result = await pool.query(
      `DELETE FROM oauth_states
       WHERE state = $1 AND created_at > NOW() - INTERVAL '${STATE_TTL_MINUTES} minutes'
       RETURNING *`,
      [state]
    );
    return result.rows[0] ?? null;
  }

  /** Housekeeping for handshakes nobody finished. */
  static async purgeStaleStates() {
    const result = await pool.query(
      `DELETE FROM oauth_states WHERE created_at <= NOW() - INTERVAL '${STATE_TTL_MINUTES} minutes'`
    );
    return result.rowCount;
  }

  // ── stored connections ──

  /** Reconnecting replaces the old tokens rather than creating a second row. */
  static async save({ userId, provider, kind, accessToken, refreshToken, expiresAt, scope, providerUserId }) {
    const meta = TABLES[kind];
    const result = await pool.query(
      `INSERT INTO ${meta.table}
         (user_id, ${meta.column}, access_token, refresh_token, expires_at, scope, provider_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, ${meta.column}) DO UPDATE
         SET access_token = EXCLUDED.access_token,
             refresh_token = COALESCE(EXCLUDED.refresh_token, ${meta.table}.refresh_token),
             expires_at = EXCLUDED.expires_at,
             scope = EXCLUDED.scope,
             provider_user_id = EXCLUDED.provider_user_id,
             connected_at = NOW()
       RETURNING *`,
      [userId, provider, accessToken, refreshToken ?? null, expiresAt ?? null, scope ?? null, providerUserId ?? null]
    );
    return new Connection(result.rows[0], kind);
  }

  static async find(userId, provider, kind) {
    const meta = TABLES[kind];
    const result = await pool.query(
      `SELECT * FROM ${meta.table} WHERE user_id = $1 AND ${meta.column} = $2`,
      [userId, provider]
    );
    return result.rows[0] ? new Connection(result.rows[0], kind) : null;
  }

  static async listForUser(userId, kind) {
    const meta = TABLES[kind];
    const result = await pool.query(
      `SELECT * FROM ${meta.table} WHERE user_id = $1 ORDER BY connected_at DESC`,
      [userId]
    );
    return result.rows.map((row) => new Connection(row, kind));
  }

  static async remove(userId, provider, kind) {
    const meta = TABLES[kind];
    const result = await pool.query(
      `DELETE FROM ${meta.table} WHERE user_id = $1 AND ${meta.column} = $2`,
      [userId, provider]
    );
    return result.rowCount > 0;
  }

  /** Called after a refresh, so the stored token stays usable. */
  static async updateTokens(userId, provider, kind, { accessToken, refreshToken, expiresAt }) {
    const meta = TABLES[kind];
    const result = await pool.query(
      `UPDATE ${meta.table}
       SET access_token = $3,
           refresh_token = COALESCE($4, refresh_token),
           expires_at = $5
       WHERE user_id = $1 AND ${meta.column} = $2
       RETURNING *`,
      [userId, provider, accessToken, refreshToken ?? null, expiresAt ?? null]
    );
    return result.rows[0] ? new Connection(result.rows[0], kind) : null;
  }

  static async recordSync(userId, provider, { error = null } = {}) {
    await pool.query(
      `UPDATE connected_wearables
       SET last_synced_at = NOW(), last_sync_error = $3
       WHERE user_id = $1 AND provider = $2`,
      [userId, provider, error]
    );
  }
}

export default Connection;
