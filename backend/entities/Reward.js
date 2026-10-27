import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';
import { buildUpdate } from './buildUpdate.js';

export const REWARD_TYPES = Object.freeze(['voucher', 'membership', 'badge']);

class ClaimRejected extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

class Reward {
  constructor(row) {
    this.rewardId = row.reward_id;
    this.name = row.name;
    this.description = row.description;
    this.pointsRequired = row.points_required;
    this.rewardType = row.reward_type;
    this.stock = row.stock;
    this.isActive = row.is_active;
  }

  toJSON() {
    return {
      rewardId: this.rewardId,
      name: this.name,
      description: this.description,
      pointsRequired: this.pointsRequired,
      rewardType: this.rewardType,
      stock: this.stock,
    };
  }

  toAdminJSON() {
    return { ...this.toJSON(), isActive: this.isActive };
  }

  static async getActive() {
    const result = await pool.query(
      `SELECT * FROM rewards WHERE is_active = TRUE AND (stock IS NULL OR stock > 0) ORDER BY points_required ASC`
    );
    return result.rows.map((row) => new Reward(row));
  }

  static async findById(rewardId, client = pool, { forUpdate = false } = {}) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const result = await client.query(`SELECT * FROM rewards WHERE reward_id = $1${lock}`, [rewardId]);
    return result.rows[0] ? new Reward(result.rows[0]) : null;
  }

  /**
   * Claims a reward atomically: stock, points and the claim record all change
   * together, and concurrent claims can't overspend points or stock.
   * Returns { ok: true, claim, remainingPoints }
   *      or { ok: false, reason: 'not_found' | 'unavailable' | 'insufficient_points' }.
   * Use this instead of calling getUserPoints/deductPoints/decrementStock/recordClaim separately.
   */
  static async claim(userId, rewardId) {
    try {
      return await withTransaction(async (client) => {
        const rewardResult = await client.query(
          `UPDATE rewards
           SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - 1 END
           WHERE reward_id = $1 AND is_active = TRUE AND (stock IS NULL OR stock > 0)
           RETURNING *`,
          [rewardId]
        );
        if (!rewardResult.rowCount) {
          const exists = await Reward.findById(rewardId, client);
          throw new ClaimRejected(exists ? 'unavailable' : 'not_found');
        }
        const reward = new Reward(rewardResult.rows[0]);

        let remainingPoints;
        if (reward.pointsRequired > 0) {
          const pointsResult = await client.query(
            `UPDATE user_points SET total_points = total_points - $2
             WHERE user_id = $1 AND total_points >= $2
             RETURNING total_points`,
            [userId, reward.pointsRequired]
          );
          if (!pointsResult.rowCount) throw new ClaimRejected('insufficient_points');
          remainingPoints = pointsResult.rows[0].total_points;
        } else {
          remainingPoints = await Reward.getUserPoints(userId, client);
        }

        const claim = await Reward.recordClaim(userId, rewardId, client);
        return { ok: true, claim, reward, remainingPoints };
      });
    } catch (err) {
      if (err instanceof ClaimRejected) return { ok: false, reason: err.reason };
      throw err;
    }
  }

  // Kept for existing callers; prefer Reward.claim().
  static async decrementStock(rewardId, client = pool) {
    await client.query(
      `UPDATE rewards SET stock = stock - 1 WHERE reward_id = $1 AND stock IS NOT NULL AND stock > 0`,
      [rewardId]
    );
  }

  static async getUserPoints(userId, client = pool) {
    const result = await client.query('SELECT total_points FROM user_points WHERE user_id = $1', [userId]);
    return result.rows[0] ? result.rows[0].total_points : 0;
  }

  static async addPoints(userId, points, client = pool) {
    await client.query(
      `INSERT INTO user_points (user_id, total_points)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total_points = user_points.total_points + $2`,
      [userId, points]
    );
  }

  /**
   * Takes back points that were awarded for a run which has since been deleted or corrected.
   *
   * Unlike deductPoints this never refuses: the points were paid out for something that no
   * longer exists, so they have to go regardless of the current balance. It floors at zero
   * rather than going negative, which can happen when the user has already spent them on a
   * reward. Returns how many were actually removed.
   */
  static async reclaimPoints(userId, points, client = pool) {
    if (!Number.isFinite(points) || points <= 0) return 0;
    const result = await client.query(
      `UPDATE user_points
       SET total_points = GREATEST(0, total_points - $2)
       WHERE user_id = $1
       RETURNING total_points`,
      [userId, Math.round(points)]
    );
    if (!result.rows[0]) return 0; // no points row: nothing was ever awarded
    return Math.round(points);
  }

  // Kept for existing callers; prefer Reward.claim(). Never goes below zero.
  static async deductPoints(userId, points, client = pool) {
    const result = await client.query(
      `UPDATE user_points SET total_points = total_points - $2
       WHERE user_id = $1 AND total_points >= $2`,
      [userId, points]
    );
    return result.rowCount > 0;
  }

  static async recordClaim(userId, rewardId, client = pool) {
    const result = await client.query(
      `INSERT INTO user_claimed_rewards (user_id, reward_id) VALUES ($1, $2) RETURNING *`,
      [userId, rewardId]
    );
    return result.rows[0];
  }

  static async getClaimedByUser(userId) {
    const result = await pool.query(
      `SELECT ucr.claim_id, ucr.claimed_at, r.name, r.description, r.reward_type
       FROM user_claimed_rewards ucr
       JOIN rewards r ON r.reward_id = ucr.reward_id
       WHERE ucr.user_id = $1
       ORDER BY ucr.claimed_at DESC`,
      [userId]
    );
    return result.rows;
  }

  // ---------- System admin operations ----------

  // All rewards, including inactive and out-of-stock ones.
  static async getAllForAdmin() {
    const result = await pool.query(
      `SELECT r.*, COUNT(c.claim_id)::int AS claim_count
       FROM rewards r
       LEFT JOIN user_claimed_rewards c ON c.reward_id = r.reward_id
       GROUP BY r.reward_id
       ORDER BY r.reward_id ASC`
    );
    return result.rows.map((row) => ({ ...new Reward(row).toAdminJSON(), claimCount: row.claim_count }));
  }

  static async create({ name, description = null, pointsRequired, rewardType = null, stock = null, isActive = true }, client = pool) {
    const result = await client.query(
      `INSERT INTO rewards (name, description, points_required, reward_type, stock, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, pointsRequired, rewardType, stock, isActive]
    );
    return new Reward(result.rows[0]);
  }

  static async update(rewardId, data, client = pool) {
    const { sets, values } = buildUpdate(
      data,
      {
        name: 'name',
        description: 'description',
        pointsRequired: 'points_required',
        rewardType: 'reward_type',
        stock: 'stock',
        isActive: 'is_active',
      },
      2
    );
    if (!sets.length) return Reward.findById(rewardId, client);
    const result = await client.query(
      `UPDATE rewards SET ${sets.join(', ')} WHERE reward_id = $1 RETURNING *`,
      [rewardId, ...values]
    );
    return result.rows[0] ? new Reward(result.rows[0]) : null;
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM rewards)                          AS total,
              (SELECT COUNT(*)::int FROM rewards WHERE is_active)          AS active,
              (SELECT COUNT(*)::int FROM user_claimed_rewards)             AS total_claims,
              (SELECT COALESCE(SUM(total_points), 0)::int FROM user_points) AS points_in_circulation`
    );
    const r = result.rows[0];
    return {
      total: r.total,
      active: r.active,
      totalClaims: r.total_claims,
      pointsInCirculation: r.points_in_circulation,
    };
  }
}

export default Reward;
