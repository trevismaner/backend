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
   *
   * RANK() sits in an OUTER select over the already-limited rows, which is the part that
   * matters for cost. Putting the window function in the same SELECT as the LIMIT would make
   * Postgres rank every row in `user_run_totals` before discarding all but 50 — a full scan,
   * undoing migration 006. Ranking the top N instead gives identical numbers, because every
   * user with a higher total is by definition already inside the top N.
   *
   * Measured on 200 000 users with totals, with thousands of users sharing each distance:
   *
   *   this query                            4.1 – 4.3 ms   (index scan, 401 rows read)
   *   the same query before rank existed    4.1 – 4.5 ms
   *   RANK() in the same SELECT as LIMIT   356 ms          (sorts all 200 000, 7 MB to disk)
   *
   * So the shape is not stylistic. The obvious way to write this is 85x slower.
   */
  static async getGlobal({ limit = 50 } = {}) {
    const ranked = await pool.query(
      `SELECT top.*,
              RANK() OVER (ORDER BY top.total_distance_km DESC)::int AS rank
       FROM (
         SELECT u.user_id, u.name, u.profile_photo_url,
                t.total_distance_km::float AS total_distance_km,
                t.total_runs::int          AS total_runs
         FROM user_run_totals t
         JOIN users u ON u.user_id = t.user_id
         WHERE u.is_suspended = FALSE
         ORDER BY t.total_distance_km DESC, u.name ASC
         LIMIT $1
       ) top
       ORDER BY rank ASC, top.name ASC`,
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

    // The tail is everyone on 0 km, so it shares a rank with any ranked user also on 0 km —
    // and takes the next rank after the whole ranked set when there is nobody on 0 there.
    // Computed here rather than in SQL because the two halves come from separate queries and
    // competition ranking has to be continuous across them.
    const zeroRank = ranked.rows.find((row) => row.total_distance_km === 0);
    const tailRank = zeroRank ? zeroRank.rank : ranked.rows.length + 1;

    return [
      ...ranked.rows,
      ...unranked.rows.map((row) => ({ ...row, rank: tailRank })),
    ];
  }

  /**
   * One group's board. A single query is enough: a group has at most a few hundred members,
   * so the join is small once the per-user totals already exist.
   *
   * Same outer-window shape as the global board, for the same reason and so both boards
   * return the same fields.
   */
  static async getForGroup(groupId, { limit = 50 } = {}) {
    const result = await pool.query(
      `SELECT top.*,
              RANK() OVER (ORDER BY top.total_distance_km DESC)::int AS rank
       FROM (
         SELECT u.user_id, u.name, u.profile_photo_url,
                COALESCE(t.total_distance_km, 0)::float AS total_distance_km,
                COALESCE(t.total_runs, 0)::int          AS total_runs
         FROM group_members gm
         JOIN users u ON u.user_id = gm.user_id
         LEFT JOIN user_run_totals t ON t.user_id = u.user_id
         WHERE gm.group_id = $1 AND gm.status = 'active' AND u.is_suspended = FALSE
         ORDER BY total_distance_km DESC, u.name ASC
         LIMIT $2
       ) top
       ORDER BY rank ASC, top.name ASC`,
      [groupId, limit]
    );
    return result.rows;
  }
}

export default Leaderboard;
