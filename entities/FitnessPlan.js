import pool from '../config/db.js';
import { buildUpdate } from './buildUpdate.js';

/**
 * Fitness plans (fitness_plans table) — RU-12 create, RU-13 view, RU-14 update, RU-15 delete.
 *
 * A user may keep several plans but only one is active at a time: creating or activating a
 * plan stands the others down, which is what makes "view my fitness plan" unambiguous.
 */

// pg returns NUMERIC columns as strings
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

export const GOAL_TYPES = Object.freeze([
  'weight_loss',
  'race_prep',
  'general_fitness',
  'endurance',
  'speed',
]);

class FitnessPlan {
  constructor(row) {
    this.planId = row.plan_id;
    this.userId = row.user_id;
    this.goalType = row.goal_type;
    this.targetDistanceKm = toNumber(row.target_distance_km);
    this.weeklyFrequency = row.weekly_frequency;
    this.durationWeeks = row.duration_weeks;
    this.isActive = row.is_active;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    // Migration 007: the generated schedule.
    this.generationStatus = row.generation_status ?? 'none';
    this.generatedBy = row.generated_by ?? null;
    this.generationError = row.generation_error ?? null;
    this.generatedAt = row.generated_at ?? null;
    this.coachNotes = row.coach_notes ?? null;
  }

  toJSON() {
    return {
      planId: this.planId,
      goalType: this.goalType,
      targetDistanceKm: this.targetDistanceKm,
      weeklyFrequency: this.weeklyFrequency,
      durationWeeks: this.durationWeeks,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      generationStatus: this.generationStatus,
      generatedBy: this.generatedBy,
      generationError: this.generationError,
      generatedAt: this.generatedAt,
      coachNotes: this.coachNotes,
    };
  }

  // A new plan becomes the active one, so any previous active plan is stood down first.
  static async create(userId, { goalType, targetDistanceKm, weeklyFrequency, durationWeeks }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE fitness_plans SET is_active = FALSE WHERE user_id = $1', [userId]);
      const result = await client.query(
        `INSERT INTO fitness_plans (user_id, goal_type, target_distance_km, weekly_frequency, duration_weeks, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING *`,
        [userId, goalType, targetDistanceKm, weeklyFrequency, durationWeeks]
      );
      await client.query('COMMIT');
      return new FitnessPlan(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async findActiveByUserId(userId) {
    const result = await pool.query(
      `SELECT * FROM fitness_plans
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] ? new FitnessPlan(result.rows[0]) : null;
  }

  // Past plans too, so the user can see what they've previously followed (RU-13).
  static async findAllByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM fitness_plans WHERE user_id = $1 ORDER BY is_active DESC, created_at DESC',
      [userId]
    );
    return result.rows.map((row) => new FitnessPlan(row));
  }

  static async findByIdForUser(planId, userId) {
    const result = await pool.query(
      'SELECT * FROM fitness_plans WHERE plan_id = $1 AND user_id = $2',
      [planId, userId]
    );
    return result.rows[0] ? new FitnessPlan(result.rows[0]) : null;
  }

  static async update(planId, userId, data) {
    const { sets, values } = buildUpdate(
      {
        goalType: data.goalType,
        targetDistanceKm: data.targetDistanceKm,
        weeklyFrequency: data.weeklyFrequency,
        durationWeeks: data.durationWeeks,
      },
      {
        goalType: 'goal_type',
        targetDistanceKm: 'target_distance_km',
        weeklyFrequency: 'weekly_frequency',
        durationWeeks: 'duration_weeks',
      }
    );
    if (sets.length === 0) return FitnessPlan.findByIdForUser(planId, userId);

    const result = await pool.query(
      `UPDATE fitness_plans SET ${sets.join(', ')}, updated_at = NOW()
       WHERE plan_id = $${values.length + 1} AND user_id = $${values.length + 2}
       RETURNING *`,
      [...values, planId, userId]
    );
    return result.rows[0] ? new FitnessPlan(result.rows[0]) : null;
  }

  // Makes one plan the active one and stands the rest down, in a single transaction.
  static async setActive(planId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE fitness_plans SET is_active = FALSE WHERE user_id = $1', [userId]);
      const result = await client.query(
        `UPDATE fitness_plans SET is_active = TRUE, updated_at = NOW()
         WHERE plan_id = $1 AND user_id = $2 RETURNING *`,
        [planId, userId]
      );
      await client.query('COMMIT');
      return result.rows[0] ? new FitnessPlan(result.rows[0]) : null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async delete(planId, userId) {
    const result = await pool.query(
      'DELETE FROM fitness_plans WHERE plan_id = $1 AND user_id = $2',
      [planId, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * How the user is tracking against the active plan: runs and distance so far this week
   * against what the plan asks for. Gives RU-13 something to say beyond the targets.
   */
  static async getProgress(userId, plan) {
    if (!plan) return null;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS runs_this_week,
              COALESCE(SUM(distance_km), 0)::float AS distance_this_week
       FROM runs
       WHERE user_id = $1 AND started_at >= date_trunc('week', NOW())`,
      [userId]
    );
    const r = result.rows[0];
    return {
      runsThisWeek: r.runs_this_week,
      distanceThisWeek: Number(r.distance_this_week.toFixed(2)),
      weeklyFrequency: plan.weeklyFrequency,
      runsRemaining: plan.weeklyFrequency == null ? null : Math.max(0, plan.weeklyFrequency - r.runs_this_week),
      onTrack: plan.weeklyFrequency == null ? null : r.runs_this_week >= plan.weeklyFrequency,
    };
  }
}

export default FitnessPlan;
