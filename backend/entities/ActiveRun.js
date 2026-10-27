import pool from '../config/db.js';

// pg returns NUMERIC columns as strings
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * A run that is still being recorded (migration 005).
 *
 * The app checkpoints here while tracking, so a run survives the app being killed. At most
 * one per user — user_id is the primary key — so "do I have a run in progress?" is a single
 * row lookup, and there is no way to end up with two half-recorded runs.
 */
class ActiveRun {
  constructor(row) {
    this.userId = row.user_id;
    this.startedAt = row.started_at;
    this.distanceKm = toNumber(row.distance_km);
    this.durationSeconds = row.duration_seconds;
    this.routeGps = row.route_gps ?? [];
    this.updatedAt = row.updated_at;
  }

  toJSON() {
    return {
      startedAt: this.startedAt,
      distanceKm: this.distanceKm,
      durationSeconds: this.durationSeconds,
      routeGps: this.routeGps,
      updatedAt: this.updatedAt,
    };
  }

  /** Without the route, for deciding whether to offer a resume. */
  toSummaryJSON() {
    return {
      startedAt: this.startedAt,
      distanceKm: this.distanceKm,
      durationSeconds: this.durationSeconds,
      pointCount: Array.isArray(this.routeGps) ? this.routeGps.length : 0,
      updatedAt: this.updatedAt,
    };
  }

  static async findByUserId(userId, client = pool, { forUpdate = false } = {}) {
    const result = await client.query(
      `SELECT * FROM active_runs WHERE user_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [userId]
    );
    return result.rows[0] ? new ActiveRun(result.rows[0]) : null;
  }

  /** Starts one. Returns null when the user already has a run in progress. */
  static async start(userId, { startedAt, routeGps = [] }, client = pool) {
    const result = await client.query(
      `INSERT INTO active_runs (user_id, started_at, route_gps)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId, startedAt, JSON.stringify(routeGps)]
    );
    return result.rows[0] ? new ActiveRun(result.rows[0]) : null;
  }

  /**
   * Checkpoints progress. The route is replaced rather than appended to, because the phone
   * holds the authoritative copy — a checkpoint that arrives out of order then cannot
   * interleave points, and a retried checkpoint is harmless.
   */
  static async saveProgress(userId, { distanceKm, durationSeconds, routeGps }, client = pool) {
    const result = await client.query(
      `UPDATE active_runs
       SET distance_km      = COALESCE($2, distance_km),
           duration_seconds = COALESCE($3, duration_seconds),
           route_gps        = COALESCE($4::jsonb, route_gps),
           updated_at       = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        distanceKm ?? null,
        durationSeconds ?? null,
        routeGps === undefined || routeGps === null ? null : JSON.stringify(routeGps),
      ]
    );
    return result.rows[0] ? new ActiveRun(result.rows[0]) : null;
  }

  /** Returns true when a row was actually removed. */
  static async discard(userId, client = pool) {
    const result = await client.query('DELETE FROM active_runs WHERE user_id = $1', [userId]);
    return result.rowCount > 0;
  }
}

export default ActiveRun;
