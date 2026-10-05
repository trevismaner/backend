import pool from '../config/db.js';

/**
 * Leaderboards, read from the per-user totals maintained by migration 006.
 *
 * These used to sum every row in `runs` on every request. On 20 000 users and 1.2M runs that
 * was 563 ms of database time for the global board and 228 ms for a group's — and because the
 * query held a pooled connection for its whole duration it slowed everything else down too:
 * run history went from 65 ms to 1 806 ms at the 95th percentile while the leaderboard was
 * being viewed.
 *
 * `user_run_totals` holds one row per user, kept current by a trigger on `runs`, so the top N
 * is an index walk instead — about half a millisecond for either board.
 *
 * Figures are still cast, so the API returns numbers rather than strings.
 */
class Leaderboard {
  /**
   * The global board.
   *
   * Two steps, to keep what the old query did while still using the index. The ranked read
   * walks `idx_user_run_totals_distance` and stops at `limit`, which costs the same whether
   * there are a hundred users or a million. Only when that does not fill the board — a new or
   * small deployment — are users who have never logged a run added, which is where the old
   * LEFT JOIN put them anyway.
   */
  static async getGlobal({ limit = 50 } = {}) {
    const ranked = await pool.query(
      `SELECT u.user_id, u.name, u.profile_photo_url,
              t.total_distance_km::float AS total_distance_km,
              t.total_runs::int          AS total_runs
       FROM user_run_totals t
       JOIN users u ON u.user_id = t.user_id
       WHERE u.is_suspended = FALSE
       ORDER BY t.total_distance_km DESC, u.name ASC
       LIMIT $1`,
      [limit]
    );

    if (ranked.rows.length >= limit) return ranked.rows;

    // A user with no totals row has never logged a run. One with a row but zero runs is
    // already in `ranked`, so nobody can appear twice.
    const unranked = await pool.query(
      `SELECT u.user_id, u.name, u.profile_photo_url,
              0::float AS total_distance_km,
              0::int   AS total_runs
       FROM users u
       LEFT JOIN user_run_totals t ON t.user_id = u.user_id
       WHERE u.is_suspended = FALSE AND t.user_id IS NULL
       ORDER BY u.name ASC
       LIMIT $1`,
      [limit - ranked.rows.length]
    );

    return [...ranked.rows, ...unranked.rows];
  }

  /**
   * One group's board. A single query is enough: a group has at most a few hundred members,
   * so the join is small once the per-user totals already exist.
   */
  static async getForGroup(groupId, { limit = 50 } = {}) {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.profile_photo_url,
              COALESCE(t.total_distance_km, 0)::float AS total_distance_km,
              COALESCE(t.total_runs, 0)::int          AS total_runs
       FROM group_members gm
       JOIN users u ON u.user_id = gm.user_id
       LEFT JOIN user_run_totals t ON t.user_id = u.user_id
       WHERE gm.group_id = $1 AND gm.status = 'active' AND u.is_suspended = FALSE
       ORDER BY total_distance_km DESC, u.name ASC
       LIMIT $2`,
      [groupId, limit]
    );
    return result.rows;
  }
}

export default Leaderboard;
