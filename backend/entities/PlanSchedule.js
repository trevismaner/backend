import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';

// pg returns NUMERIC columns as strings
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * The weeks and sessions of a generated plan (migration 007).
 *
 * Kept apart from FitnessPlan because a plan exists perfectly well without a schedule — every
 * plan made before this feature has none, and one whose generation failed has none either.
 * The schedule is something a plan may have, not part of what a plan is.
 */
class PlanSchedule {
  /**
   * Replaces a plan's whole schedule in one transaction.
   *
   * Replace rather than merge: a regenerated plan is a new plan, and half of an old schedule
   * left interleaved with half of a new one is not a thing anyone asked for. The delete
   * cascades to sessions.
   */
  static async replace(planId, { weeks, coachNotes, generatedBy }) {
    return withTransaction(async (client) => {
      await client.query('DELETE FROM plan_weeks WHERE plan_id = $1', [planId]);

      for (const week of weeks) {
        const weekRow = await client.query(
          `INSERT INTO plan_weeks (plan_id, week_number, focus, target_distance_km, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING week_id`,
          [planId, week.weekNumber, week.focus ?? null, week.targetDistanceKm ?? 0, week.notes ?? null]
        );
        const weekId = weekRow.rows[0].week_id;

        for (const session of week.sessions) {
          await client.query(
            `INSERT INTO plan_sessions (week_id, day_of_week, session_type, distance_km, duration_minutes, description)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              weekId,
              session.dayOfWeek,
              session.sessionType,
              session.distanceKm ?? null,
              session.durationMinutes ?? null,
              session.description ?? null,
            ]
          );
        }
      }

      await client.query(
        `UPDATE fitness_plans
            SET generation_status = 'ready',
                generated_by      = $2,
                coach_notes       = $3,
                generation_error  = NULL,
                generated_at      = NOW(),
                updated_at        = NOW()
          WHERE plan_id = $1`,
        [planId, generatedBy, coachNotes ?? null]
      );

      return true;
    });
  }

  /** Marks a plan as being generated, so a second request does not start a second generation. */
  static async markGenerating(planId, userId) {
    const result = await pool.query(
      `UPDATE fitness_plans
          SET generation_status = 'generating', generation_error = NULL, updated_at = NOW()
        WHERE plan_id = $1 AND user_id = $2 AND generation_status <> 'generating'
        RETURNING plan_id`,
      [planId, userId]
    );
    return result.rowCount > 0;
  }

  static async markFailed(planId, reason) {
    await pool.query(
      `UPDATE fitness_plans
          SET generation_status = 'failed', generation_error = $2, updated_at = NOW()
        WHERE plan_id = $1`,
      [planId, String(reason).slice(0, 500)]
    );
  }

  /**
   * A plan's schedule, weeks in order with their sessions nested.
   *
   * One query with a join rather than one per week: a 52-week plan would otherwise be 53
   * round trips, which is slow anywhere and painful across a network to a hosted database.
   */
  static async findByPlanId(planId) {
    const result = await pool.query(
      `SELECT w.week_id, w.week_number, w.focus, w.target_distance_km, w.notes,
              s.session_id, s.day_of_week, s.session_type, s.distance_km,
              s.duration_minutes, s.description, s.completed_run_id, s.completed_at,
              r.name AS completed_run_name, r.distance_km AS completed_distance_km,
              r.started_at AS completed_started_at
         FROM plan_weeks w
         LEFT JOIN plan_sessions s ON s.week_id = w.week_id
         LEFT JOIN runs r ON r.run_id = s.completed_run_id
        WHERE w.plan_id = $1
        ORDER BY w.week_number ASC, s.day_of_week ASC`,
      [planId]
    );

    const weeks = [];
    const byNumber = new Map();

    for (const row of result.rows) {
      if (!byNumber.has(row.week_number)) {
        const week = {
          weekNumber: row.week_number,
          focus: row.focus,
          targetDistanceKm: toNumber(row.target_distance_km),
          notes: row.notes,
          sessions: [],
        };
        byNumber.set(row.week_number, week);
        weeks.push(week);
      }
      if (row.session_id === null) continue; // a week with no sessions

      byNumber.get(row.week_number).sessions.push({
        sessionId: row.session_id,
        dayOfWeek: row.day_of_week,
        sessionType: row.session_type,
        distanceKm: toNumber(row.distance_km),
        durationMinutes: row.duration_minutes,
        description: row.description,
        completed: row.completed_run_id !== null,
        completedRun: row.completed_run_id === null ? null : {
          runId: row.completed_run_id,
          name: row.completed_run_name,
          distanceKm: toNumber(row.completed_distance_km),
          startedAt: row.completed_started_at,
        },
        completedAt: row.completed_at,
      });
    }

    return weeks;
  }

  /** Ticks a session off against the run that completed it. */
  static async completeSession(sessionId, userId, runId) {
    const result = await pool.query(
      `UPDATE plan_sessions s
          SET completed_run_id = $3, completed_at = NOW()
         FROM plan_weeks w, fitness_plans p
        WHERE s.session_id = $1
          AND w.week_id = s.week_id
          AND p.plan_id = w.plan_id
          AND p.user_id = $2
        RETURNING s.session_id`,
      [sessionId, userId, runId]
    );
    return result.rowCount > 0;
  }

  /** Un-ticks a session. */
  static async clearSession(sessionId, userId) {
    const result = await pool.query(
      `UPDATE plan_sessions s
          SET completed_run_id = NULL, completed_at = NULL
         FROM plan_weeks w, fitness_plans p
        WHERE s.session_id = $1
          AND w.week_id = s.week_id
          AND p.plan_id = w.plan_id
          AND p.user_id = $2
        RETURNING s.session_id`,
      [sessionId, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Planned against actual, for the whole plan.
   *
   * The comparison a schedule makes possible: how much was planned, how much was ticked off,
   * and how many sessions were done.
   */
  static async getProgress(planId) {
    const result = await pool.query(
      `SELECT COUNT(s.session_id)::int                                        AS planned_sessions,
              COUNT(s.completed_run_id)::int                                  AS completed_sessions,
              COALESCE(SUM(s.distance_km), 0)::float                          AS planned_km,
              COALESCE(SUM(s.distance_km) FILTER (WHERE s.completed_run_id IS NOT NULL), 0)::float AS completed_km
         FROM plan_weeks w
         LEFT JOIN plan_sessions s ON s.week_id = w.week_id
        WHERE w.plan_id = $1`,
      [planId]
    );
    const row = result.rows[0];
    return {
      plannedSessions: row.planned_sessions,
      completedSessions: row.completed_sessions,
      plannedKm: Number(row.planned_km.toFixed(1)),
      completedKm: Number(row.completed_km.toFixed(1)),
    };
  }
}

export default PlanSchedule;
