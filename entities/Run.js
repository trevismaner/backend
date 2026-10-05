import pool from '../config/db.js';

// pg returns NUMERIC columns as strings
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

class Run {
  constructor(row) {
    this.runId = row.run_id;
    this.userId = row.user_id;
    this.name = row.name;
    this.description = row.description;
    this.distanceKm = toNumber(row.distance_km);
    this.durationSeconds = row.duration_seconds;
    this.caloriesBurned = row.calories_burned;
    this.avgHeartRate = row.avg_heart_rate;
    this.maxHeartRate = row.max_heart_rate;
    this.routeGps = row.route_gps;
    this.startedAt = row.started_at;
    this.endedAt = row.ended_at;
    this.createdAt = row.created_at;
    // migration 003: 'manual' for runs the user logged, else the provider it came from
    this.source = row.source ?? 'manual';
    this.externalId = row.external_id ?? null;
  }

  toJSON() {
    return {
      runId: this.runId,
      name: this.name,
      description: this.description,
      distanceKm: this.distanceKm,
      durationSeconds: this.durationSeconds,
      caloriesBurned: this.caloriesBurned,
      avgHeartRate: this.avgHeartRate,
      maxHeartRate: this.maxHeartRate,
      routeGps: this.routeGps,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      source: this.source,
    };
  }

  toSummaryJSON() {
    return {
      runId: this.runId,
      name: this.name,
      distanceKm: this.distanceKm,
      durationSeconds: this.durationSeconds,
      startedAt: this.startedAt,
      source: this.source,
    };
  }

  // ?? instead of || so real zeros (e.g. 0 calories) are kept.
  static async create(userId, data, client = pool) {
    const result = await client.query(
      `INSERT INTO runs (user_id, name, description, distance_km, duration_seconds,
                          calories_burned, avg_heart_rate, max_heart_rate, route_gps,
                          started_at, ended_at, client_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        userId,
        data.name ?? null,
        data.description ?? null,
        data.distanceKm,
        data.durationSeconds,
        data.caloriesBurned ?? null,
        data.avgHeartRate ?? null,
        data.maxHeartRate ?? null,
        JSON.stringify(data.routeGps ?? []),
        data.startedAt,
        data.endedAt ?? null,
        data.clientRunId ?? null,
      ]
    );
    return new Run(result.rows[0]);
  }

  /**
   * Looks a run up by the idempotency key the app sent (migration 005), so a retried or
   * double-tapped save returns the run that already exists instead of storing it twice.
   */
  static async findByClientRunId(userId, clientRunId, client = pool) {
    const result = await client.query(
      'SELECT * FROM runs WHERE user_id = $1 AND client_run_id = $2',
      [userId, clientRunId]
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  /**
   * Corrects the recorded figures for a run. Only the fields present in `data` are written,
   * so a caller can fix the distance without disturbing anything else.
   */
  static async update(runId, userId, data, client = pool) {
    const columns = {
      name: 'name',
      description: 'description',
      distanceKm: 'distance_km',
      durationSeconds: 'duration_seconds',
      caloriesBurned: 'calories_burned',
      avgHeartRate: 'avg_heart_rate',
      maxHeartRate: 'max_heart_rate',
      startedAt: 'started_at',
      endedAt: 'ended_at',
      routeGps: 'route_gps',
    };

    const sets = [];
    const params = [runId, userId];
    for (const [field, column] of Object.entries(columns)) {
      if (!(field in data)) continue;
      params.push(field === 'routeGps' ? JSON.stringify(data[field] ?? []) : data[field]);
      sets.push(`${column} = $${params.length}${field === 'routeGps' ? '::jsonb' : ''}`);
    }
    if (sets.length === 0) return Run.findById(runId, client);

    const result = await client.query(
      `UPDATE runs SET ${sets.join(', ')} WHERE run_id = $1 AND user_id = $2 RETURNING *`,
      params
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  /**
   * Stores a run imported from a connected wearable (RU-16).
   * `source` + `externalId` are unique per user, so re-syncing the same activity
   * is a no-op rather than a duplicate: returns null when the run already exists.
   */
  static async createImported(userId, data, client = pool) {
    const result = await client.query(
      `INSERT INTO runs (user_id, name, distance_km, duration_seconds, calories_burned,
                          avg_heart_rate, max_heart_rate, started_at, ended_at,
                          source, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        userId,
        data.name ?? null,
        data.distanceKm,
        data.durationSeconds,
        data.caloriesBurned ?? null,
        data.avgHeartRate ?? null,
        data.maxHeartRate ?? null,
        data.startedAt,
        data.endedAt ?? null,
        data.source,
        data.externalId,
      ]
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  static async findByUserId(userId, { limit = 20, offset = 0 } = {}) {
    const result = await pool.query(
      `SELECT * FROM runs WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows.map((row) => new Run(row));
  }

  /**
   * One runner's lifetime totals, added up in SQL.
   *
   * The profile screen used to fetch every run and sum them in the app, which meant sending
   * the whole history over the network to produce two numbers — and it broke outright once
   * the history outgrew a single page. These are the numbers it actually wanted.
   */
  static async getTotalsForUser(userId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int                                   AS run_count,
              COALESCE(SUM(distance_km), 0)::float            AS total_distance_km,
              COALESCE(SUM(duration_seconds), 0)::int         AS total_duration_seconds,
              COALESCE(MAX(distance_km), 0)::float            AS longest_run_km,
              MIN(started_at)                                 AS first_run_at,
              MAX(started_at)                                 AS last_run_at
       FROM runs WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return {
      runCount: row.run_count,
      totalDistanceKm: Number(row.total_distance_km.toFixed(2)),
      totalDurationSeconds: row.total_duration_seconds,
      longestRunKm: Number(row.longest_run_km.toFixed(2)),
      firstRunAt: row.first_run_at,
      lastRunAt: row.last_run_at,
    };
  }

  static async searchByUserId(userId, searchTerm) {
    const result = await pool.query(
      `SELECT * FROM runs
       WHERE user_id = $1 AND (name ILIKE $2 OR description ILIKE $2)
       ORDER BY started_at DESC`,
      [userId, `%${searchTerm}%`]
    );
    return result.rows.map((row) => new Run(row));
  }

  // Unscoped lookup: only use where the caller is allowed to see any run (e.g. admins).
  static async findById(runId, client = pool) {
    const result = await client.query('SELECT * FROM runs WHERE run_id = $1', [runId]);
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  // Use this in ViewRunDetailsController so users can only open their own runs.
  static async findByIdForUser(runId, userId) {
    const result = await pool.query(
      'SELECT * FROM runs WHERE run_id = $1 AND user_id = $2',
      [runId, userId]
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  static async updateName(runId, userId, name) {
    const result = await pool.query(
      `UPDATE runs SET name = $3 WHERE run_id = $1 AND user_id = $2 RETURNING *`,
      [runId, userId, name]
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  static async updateDescription(runId, userId, description) {
    const result = await pool.query(
      `UPDATE runs SET description = $3 WHERE run_id = $1 AND user_id = $2 RETURNING *`,
      [runId, userId, description]
    );
    return result.rows[0] ? new Run(result.rows[0]) : null;
  }

  /**
   * Aggregates for the insight screens (RU-17 calories, RU-18 heart rate, RU-19 trends).
   *
   * Trends compare a window against the window immediately before it — 7 days vs the
   * previous 7 (short term) and 30 vs the previous 30 (long term) — so "improving" means
   * improving relative to the user's own recent training, not an absolute target.
   * Pace is seconds per km, so a NEGATIVE pace change is a speed-up; distance is the
   * opposite. The percent fields are null when the earlier window has no data to compare.
   */
  static async getInsights(userId) {
    const [calories, heart, windows] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE calories_burned IS NOT NULL)::int AS runs_with_data,
                COALESCE(SUM(calories_burned), 0)::int                   AS total_calories,
                AVG(calories_burned)::float                              AS avg_per_run,
                (SUM(calories_burned) FILTER (WHERE distance_km > 0)
                  / NULLIF(SUM(distance_km) FILTER (WHERE calories_burned IS NOT NULL), 0))::float AS avg_per_km
         FROM runs WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE avg_heart_rate IS NOT NULL)::int AS runs_with_data,
                AVG(avg_heart_rate)::float                              AS avg_heart_rate,
                MAX(max_heart_rate)::int                                AS max_heart_rate,
                MIN(avg_heart_rate)::int                                AS lowest_avg_heart_rate
         FROM runs WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT label,
                COUNT(*)::int                                   AS run_count,
                COALESCE(SUM(distance_km), 0)::float            AS distance_km,
                (SUM(duration_seconds) FILTER (WHERE distance_km > 0)
                  / NULLIF(SUM(distance_km) FILTER (WHERE duration_seconds IS NOT NULL), 0))::float AS avg_pace_seconds_per_km,
                AVG(avg_heart_rate)::float                      AS avg_heart_rate
         FROM (
           SELECT r.*, w.label
           FROM runs r
           JOIN (VALUES
             ('short_current',  INTERVAL '0 days',  INTERVAL '7 days'),
             ('short_previous', INTERVAL '7 days',  INTERVAL '14 days'),
             ('long_current',   INTERVAL '0 days',  INTERVAL '30 days'),
             ('long_previous',  INTERVAL '30 days', INTERVAL '60 days')
           ) AS w(label, from_ago, to_ago)
             ON r.started_at <= NOW() - w.from_ago
            AND r.started_at >  NOW() - w.to_ago
           WHERE r.user_id = $1
         ) AS windowed
         GROUP BY label`,
        [userId]
      ),
    ]);

    const c = calories.rows[0];
    const h = heart.rows[0];
    const byLabel = Object.fromEntries(windows.rows.map((r) => [r.label, r]));
    const blank = { run_count: 0, distance_km: 0, avg_pace_seconds_per_km: null, avg_heart_rate: null };
    const win = (label) => byLabel[label] ?? blank;

    // null rather than a misleading 0% when there is nothing to compare against
    const percentChange = (now, before) =>
      before === null || before === undefined || Number(before) === 0 || now === null || now === undefined
        ? null
        : Number((((now - before) / before) * 100).toFixed(1));

    const shape = (currentLabel, previousLabel) => {
      const cur = win(currentLabel);
      const prev = win(previousLabel);
      return {
        current: {
          runCount: cur.run_count,
          distanceKm: Number(Number(cur.distance_km).toFixed(2)),
          avgPaceSecondsPerKm: cur.avg_pace_seconds_per_km === null ? null : Math.round(cur.avg_pace_seconds_per_km),
          avgHeartRate: cur.avg_heart_rate === null ? null : Math.round(cur.avg_heart_rate),
        },
        previous: {
          runCount: prev.run_count,
          distanceKm: Number(Number(prev.distance_km).toFixed(2)),
          avgPaceSecondsPerKm: prev.avg_pace_seconds_per_km === null ? null : Math.round(prev.avg_pace_seconds_per_km),
          avgHeartRate: prev.avg_heart_rate === null ? null : Math.round(prev.avg_heart_rate),
        },
        change: {
          distancePercent: percentChange(Number(cur.distance_km), Number(prev.distance_km)),
          runCountPercent: percentChange(cur.run_count, prev.run_count),
          // negative = getting faster
          pacePercent: percentChange(cur.avg_pace_seconds_per_km, prev.avg_pace_seconds_per_km),
        },
      };
    };

    return {
      calories: {
        runsWithData: c.runs_with_data,
        totalCalories: c.total_calories,
        avgPerRun: c.avg_per_run === null ? null : Math.round(c.avg_per_run),
        avgPerKm: c.avg_per_km === null ? null : Math.round(c.avg_per_km),
      },
      heartRate: {
        runsWithData: h.runs_with_data,
        avgHeartRate: h.avg_heart_rate === null ? null : Math.round(h.avg_heart_rate),
        maxHeartRate: h.max_heart_rate,
        lowestAvgHeartRate: h.lowest_avg_heart_rate,
      },
      trends: {
        shortTerm: shape('short_current', 'short_previous'),
        longTerm: shape('long_current', 'long_previous'),
      },
    };
  }

  // ---------- System admin operations ----------

  /**
   * Lists runs across all users. minDistanceKm and maxPaceSecondsPerKm
   * help find suspicious runs (very long, or impossibly fast).
   */
  static async findAllForAdmin({ userId, minDistanceKm, maxPaceSecondsPerKm, limit = 20, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (userId != null) {
      params.push(userId);
      conditions.push(`r.user_id = $${params.length}`);
    }
    if (minDistanceKm != null) {
      params.push(minDistanceKm);
      conditions.push(`r.distance_km >= $${params.length}`);
    }
    if (maxPaceSecondsPerKm != null) {
      params.push(maxPaceSecondsPerKm);
      conditions.push(
        `r.distance_km > 0 AND r.duration_seconds IS NOT NULL
         AND r.duration_seconds / r.distance_km <= $${params.length}`
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM runs r ${where}`, params);

    const pageParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT r.*, u.name AS user_name, u.email AS user_email
       FROM runs r
       JOIN users u ON u.user_id = r.user_id
       ${where}
       ORDER BY r.started_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    return {
      runs: result.rows.map((row) => {
        const run = new Run(row);
        return {
          ...run.toSummaryJSON(),
          userId: run.userId,
          userName: row.user_name,
          userEmail: row.user_email,
          endedAt: run.endedAt,
          paceSecondsPerKm:
            run.distanceKm > 0 && run.durationSeconds != null
              ? Math.round(run.durationSeconds / run.distanceKm)
              : null,
        };
      }),
      total: countResult.rows[0].total,
    };
  }

  static async delete(runId, client = pool) {
    const result = await client.query('DELETE FROM runs WHERE run_id = $1', [runId]);
    return result.rowCount > 0;
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(distance_km), 0)::float AS total_distance_km,
              COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days')::int AS last_7_days
       FROM runs`
    );
    const r = result.rows[0];
    return { total: r.total, totalDistanceKm: r.total_distance_km, last7Days: r.last_7_days };
  }
}

export default Run;
