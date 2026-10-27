import pool from '../config/db.js';
import { buildUpdate } from './buildUpdate.js';

// name -> condition, checked after every run
const RUN_MILESTONES = [
  { name: 'First Steps', reached: (s) => s.runCount >= 1 },
  { name: 'Consistent Runner', reached: (s) => s.runCount >= 10 },
  { name: 'Marathoner', reached: (s) => s.totalDistanceKm >= 100 },
];

class Badge {
  static async getAll() {
    const result = await pool.query('SELECT * FROM badges ORDER BY badge_id ASC');
    return result.rows;
  }

  static async getAllWithCounts() {
    const result = await pool.query(
      `SELECT b.*, COUNT(ub.user_id)::int AS earned_count
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.badge_id
       GROUP BY b.badge_id
       ORDER BY b.badge_id ASC`
    );
    return result.rows;
  }

  static async findById(badgeId, client = pool) {
    const result = await client.query('SELECT * FROM badges WHERE badge_id = $1', [badgeId]);
    return result.rows[0] || null;
  }

  static async create({ name, description = null, iconUrl = null }, client = pool) {
    const result = await client.query(
      `INSERT INTO badges (name, description, icon_url) VALUES ($1, $2, $3) RETURNING *`,
      [name, description, iconUrl]
    );
    return result.rows[0];
  }

  static async update(badgeId, data, client = pool) {
    const { sets, values } = buildUpdate(
      data,
      { name: 'name', description: 'description', iconUrl: 'icon_url' },
      2
    );
    if (!sets.length) return Badge.findById(badgeId, client);
    const result = await client.query(
      `UPDATE badges SET ${sets.join(', ')} WHERE badge_id = $1 RETURNING *`,
      [badgeId, ...values]
    );
    return result.rows[0] || null;
  }

  static async countEarned(badgeId, client = pool) {
    const result = await client.query(
      'SELECT COUNT(*)::int AS count FROM user_badges WHERE badge_id = $1',
      [badgeId]
    );
    return result.rows[0].count;
  }

  static async delete(badgeId, client = pool) {
    const result = await client.query('DELETE FROM badges WHERE badge_id = $1', [badgeId]);
    return result.rowCount > 0;
  }

  static async getForUser(userId) {
    const result = await pool.query(
      `SELECT b.badge_id, b.name, b.description, b.icon_url, ub.earned_at, ub.is_displayed
       FROM user_badges ub
       JOIN badges b ON b.badge_id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async hasBadge(userId, badgeName) {
    const result = await pool.query(
      `SELECT 1 FROM user_badges ub
       JOIN badges b ON b.badge_id = ub.badge_id
       WHERE ub.user_id = $1 AND b.name = $2`,
      [userId, badgeName]
    );
    return result.rows.length > 0;
  }

  // Returns the new user_badges row, or null if the user already had it / badge doesn't exist.
  static async award(userId, badgeName, client = pool) {
    const result = await client.query(
      `INSERT INTO user_badges (user_id, badge_id)
       SELECT $1, badge_id FROM badges WHERE name = $2
       ORDER BY badge_id LIMIT 1
       ON CONFLICT (user_id, badge_id) DO NOTHING
       RETURNING *`,
      [userId, badgeName]
    );
    return result.rows[0] || null;
  }

  static async awardById(userId, badgeId, client = pool) {
    const result = await client.query(
      `INSERT INTO user_badges (user_id, badge_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, badge_id) DO NOTHING
       RETURNING *`,
      [userId, badgeId]
    );
    return result.rows[0] || null;
  }

  static async revoke(userId, badgeId, client = pool) {
    const result = await client.query(
      'DELETE FROM user_badges WHERE user_id = $1 AND badge_id = $2',
      [userId, badgeId]
    );
    return result.rowCount > 0;
  }

  // Returns true if the user has this badge (so the controller can 404 otherwise).
  static async setDisplayed(userId, badgeId, isDisplayed) {
    const result = await pool.query(
      `UPDATE user_badges SET is_displayed = $3 WHERE user_id = $1 AND badge_id = $2`,
      [userId, badgeId, isDisplayed]
    );
    return result.rowCount > 0;
  }

  static async checkAndAwardRunMilestones(userId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS run_count,
              COALESCE(SUM(distance_km), 0)::float AS total_distance_km
       FROM runs WHERE user_id = $1`,
      [userId]
    );
    const stats = {
      runCount: result.rows[0].run_count,
      totalDistanceKm: result.rows[0].total_distance_km,
    };

    const newlyAwarded = [];
    for (const milestone of RUN_MILESTONES) {
      if (milestone.reached(stats) && (await Badge.award(userId, milestone.name))) {
        newlyAwarded.push(milestone.name);
      }
    }
    return newlyAwarded;
  }
}

export default Badge;
