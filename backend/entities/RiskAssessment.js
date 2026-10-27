import pool from '../config/db.js';

/**
 * Risk assessment forms and the scores derived from them (RU-10, RU-11).
 *
 * The form is what the user declares; the score is what the app computes from that form
 * plus their actual running. Both are kept as history so the trend can be shown.
 */

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

export const CHRONIC_CONDITIONS = Object.freeze(['asthma', 'hypertension', 'diabetes', 'knee_arthritis']);

export class RiskAssessmentForm {
  constructor(row) {
    this.formId = row.form_id;
    this.userId = row.user_id;
    this.isCurrentlySick = row.is_currently_sick;
    this.chronicConditions = row.chronic_conditions ?? [];
    this.pastInjuries = row.past_injuries ?? [];
    this.selfRatedSoreness = row.self_rated_soreness;
    this.submittedAt = row.submitted_at;
  }

  toJSON() {
    return {
      formId: this.formId,
      isCurrentlySick: this.isCurrentlySick,
      chronicConditions: this.chronicConditions,
      pastInjuries: this.pastInjuries,
      selfRatedSoreness: this.selfRatedSoreness,
      submittedAt: this.submittedAt,
    };
  }
}

export class RiskScore {
  constructor(row) {
    this.scoreId = row.score_id;
    this.userId = row.user_id;
    this.mlBaseScore = toNumber(row.ml_base_score);
    this.weatherModifier = toNumber(row.weather_modifier);
    this.biometricModifier = toNumber(row.biometric_modifier);
    this.healthConditionModifier = toNumber(row.health_condition_modifier);
    this.finalScore = toNumber(row.final_score);
    this.riskLevel = row.risk_level;
    this.contributingFactors = row.contributing_factors ?? {};
    this.recommendation = row.recommendation;
    this.calculatedAt = row.calculated_at;
  }

  toJSON() {
    return {
      scoreId: this.scoreId,
      mlBaseScore: this.mlBaseScore,
      weatherModifier: this.weatherModifier,
      biometricModifier: this.biometricModifier,
      healthConditionModifier: this.healthConditionModifier,
      finalScore: this.finalScore,
      riskLevel: this.riskLevel,
      contributingFactors: this.contributingFactors,
      recommendation: this.recommendation,
      calculatedAt: this.calculatedAt,
    };
  }
}

class RiskAssessment {
  // RU-11 — each submission is kept, so the form has a history rather than being overwritten.
  static async saveForm(userId, { isCurrentlySick, chronicConditions, pastInjuries, selfRatedSoreness }) {
    const result = await pool.query(
      `INSERT INTO risk_assessment_forms
         (user_id, is_currently_sick, chronic_conditions, past_injuries, self_rated_soreness)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [
        userId,
        isCurrentlySick,
        chronicConditions,
        JSON.stringify(pastInjuries ?? []),
        selfRatedSoreness,
      ]
    );
    return new RiskAssessmentForm(result.rows[0]);
  }

  static async getLatestForm(userId) {
    const result = await pool.query(
      'SELECT * FROM risk_assessment_forms WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1',
      [userId]
    );
    return result.rows[0] ? new RiskAssessmentForm(result.rows[0]) : null;
  }

  static async saveScore(userId, score) {
    const result = await pool.query(
      `INSERT INTO risk_scores
         (user_id, ml_base_score, weather_modifier, biometric_modifier, health_condition_modifier,
          final_score, risk_level, contributing_factors, recommendation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING *`,
      [
        userId,
        score.mlBaseScore,
        score.weatherModifier,
        score.biometricModifier,
        score.healthConditionModifier,
        score.finalScore,
        score.riskLevel,
        JSON.stringify(score.contributingFactors),
        score.recommendation,
      ]
    );
    return new RiskScore(result.rows[0]);
  }

  static async getLatestScore(userId) {
    const result = await pool.query(
      'SELECT * FROM risk_scores WHERE user_id = $1 ORDER BY calculated_at DESC LIMIT 1',
      [userId]
    );
    return result.rows[0] ? new RiskScore(result.rows[0]) : null;
  }

  // Recent scores, oldest first, so the screen can draw a trend line.
  static async getScoreHistory(userId, limit = 10) {
    const result = await pool.query(
      'SELECT * FROM risk_scores WHERE user_id = $1 ORDER BY calculated_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map((row) => new RiskScore(row).toJSON()).reverse();
  }

  /**
   * The last place this user actually ran, read off the most recent route_gps track.
   * Used to look up weather where they run. Returns null when they have no GPS history.
   */
  static async getLastKnownLocation(userId) {
    const result = await pool.query(
      `SELECT route_gps FROM runs
       WHERE user_id = $1
         AND route_gps IS NOT NULL
         AND jsonb_typeof(route_gps) = 'array'
         AND jsonb_array_length(route_gps) > 0
       ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );
    const track = result.rows[0]?.route_gps;
    if (!Array.isArray(track) || !track.length) return null;
    const point = track[track.length - 1];
    const lat = Number(point?.lat), lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  /**
   * The running data the scorer needs: this week's load, the four weeks before it (for the
   * acute:chronic comparison), and recent vs baseline heart rate.
   */
  static async getRunStats(userId) {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(distance_km) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days'), 0)::float  AS last7_km,
         COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days')::int                          AS last7_runs,
         COALESCE(SUM(distance_km) FILTER (WHERE started_at <  NOW() - INTERVAL '7 days'
                                             AND started_at >= NOW() - INTERVAL '35 days'), 0)::float  AS prev28_km,
         AVG(avg_heart_rate) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days')::float             AS recent_hr,
         AVG(avg_heart_rate) FILTER (WHERE started_at <  NOW() - INTERVAL '7 days'
                                       AND started_at >= NOW() - INTERVAL '35 days')::float            AS baseline_hr
       FROM runs WHERE user_id = $1`,
      [userId]
    );
    const r = result.rows[0];
    return {
      last7DaysKm: Number(r.last7_km.toFixed(2)),
      last7DaysRuns: r.last7_runs,
      previous28DaysKm: Number(r.prev28_km.toFixed(2)),
      recentAvgHeartRate: r.recent_hr === null ? null : Number(r.recent_hr.toFixed(1)),
      baselineAvgHeartRate: r.baseline_hr === null ? null : Number(r.baseline_hr.toFixed(1)),
    };
  }
}

export default RiskAssessment;
