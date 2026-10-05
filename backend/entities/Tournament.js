import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';
import { buildUpdate } from './buildUpdate.js';
export const STATUS_TRANSITIONS = Object.freeze({
  open: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
});

export class TournamentStatusError extends Error {
  constructor(from, to) {
    super(`Cannot change tournament status from '${from}' to '${to}'`);
    this.status = 400;
    this.code = 'INVALID_STATUS_TRANSITION';
  }
}

class Tournament {
  constructor(row) {
    this.tournamentId = row.tournament_id;
    this.groupId = row.group_id;
    this.createdBy = row.created_by;
    this.name = row.name;
    this.description = row.description;
    this.distanceType = row.distance_type;
    this.maxParticipants = row.max_participants;
    this.registrationDeadline = row.registration_deadline;
    this.status = row.status;
    this.startDate = row.start_date;
    this.endDate = row.end_date;
    this.createdAt = row.created_at;
  }

  toJSON() {
    return {
      tournamentId: this.tournamentId,
      groupId: this.groupId,
      name: this.name,
      description: this.description,
      distanceType: this.distanceType,
      maxParticipants: this.maxParticipants,
      registrationDeadline: this.registrationDeadline,
      status: this.status,
      startDate: this.startDate,
      endDate: this.endDate,
    };
  }

  static isValidTransition(from, to) {
    return (STATUS_TRANSITIONS[from] || []).includes(to);
  }

  static async create({ groupId, createdBy, name, description, distanceType, startDate, endDate }) {
    const result = await pool.query(
      `INSERT INTO tournaments (group_id, created_by, name, description, distance_type, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [groupId, createdBy, name, description ?? null, distanceType ?? null, startDate ?? null, endDate ?? null]
    );
    return new Tournament(result.rows[0]);
  }

  static async findById(tournamentId, client = pool, { forUpdate = false } = {}) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const result = await client.query(
      `SELECT * FROM tournaments WHERE tournament_id = $1${lock}`,
      [tournamentId]
    );
    return result.rows[0] ? new Tournament(result.rows[0]) : null;
  }
  static async update(tournamentId, data) {
    const { sets, values } = buildUpdate(
      data,
      {
        name: 'name',
        description: 'description',
        distanceType: 'distance_type',
        startDate: 'start_date',
        endDate: 'end_date',
      },
      2
    );
    if (!sets.length) return Tournament.findById(tournamentId);
    const result = await pool.query(
      `UPDATE tournaments SET ${sets.join(', ')} WHERE tournament_id = $1 RETURNING *`,
      [tournamentId, ...values]
    );
    return result.rows[0] ? new Tournament(result.rows[0]) : null;
  }

  static async delete(tournamentId) {
    await pool.query('DELETE FROM tournaments WHERE tournament_id = $1', [tournamentId]);
  }

  static async setLimits(tournamentId, data) {
    const { sets, values } = buildUpdate(
      data,
      { maxParticipants: 'max_participants', registrationDeadline: 'registration_deadline' },
      2
    );
    if (!sets.length) return Tournament.findById(tournamentId);
    const result = await pool.query(
      `UPDATE tournaments SET ${sets.join(', ')} WHERE tournament_id = $1 RETURNING *`,
      [tournamentId, ...values]
    );
    return result.rows[0] ? new Tournament(result.rows[0]) : null;
  }

  static async updateStatus(tournamentId, status) {
    return withTransaction(async (client) => {
      const current = await Tournament.findById(tournamentId, client, { forUpdate: true });
      if (!current) return null;
      if (!Tournament.isValidTransition(current.status, status)) {
        throw new TournamentStatusError(current.status, status);
      }
      const result = await client.query(
        `UPDATE tournaments SET status = $2 WHERE tournament_id = $1 RETURNING *`,
        [tournamentId, status]
      );
      if (status === 'completed') await Tournament.recalculateRanks(tournamentId, client);
      return new Tournament(result.rows[0]);
    });
  }

  static async countParticipants(tournamentId, client = pool) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM tournament_participants
       WHERE tournament_id = $1 AND withdrawn = FALSE`,
      [tournamentId]
    );
    return result.rows[0].count;
  }

  static async getParticipation(tournamentId, userId) {
    const result = await pool.query(
      `SELECT * FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId]
    );
    return result.rows[0] || null;
  }

  static async addParticipant(tournamentId, userId, client = pool) {
    await client.query(
      `INSERT INTO tournament_participants (tournament_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (tournament_id, user_id) DO UPDATE SET withdrawn = FALSE`,
      [tournamentId, userId]
    );
  }

  static async joinWithCapacity(tournamentId, userId) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT t.*, g.is_suspended AS group_suspended
         FROM tournaments t
         JOIN groups g ON g.group_id = t.group_id
         WHERE t.tournament_id = $1
         FOR UPDATE OF t`,
        [tournamentId]
      );
      const row = result.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.group_suspended) return { ok: false, reason: 'group_suspended' };
      if (row.status !== 'open') return { ok: false, reason: 'not_open' };
      if (row.registration_deadline && new Date(row.registration_deadline) < new Date()) {
        return { ok: false, reason: 'deadline_passed' };
      }

      const existing = await client.query(
        `SELECT withdrawn FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );
      if (existing.rows[0] && !existing.rows[0].withdrawn) {
        return { ok: false, reason: 'already_joined' };
      }

      if (row.max_participants != null) {
        const count = await Tournament.countParticipants(tournamentId, client);
        if (count >= row.max_participants) return { ok: false, reason: 'full' };
      }

      await Tournament.addParticipant(tournamentId, userId, client);
      return { ok: true };
    });
  }

  static async withdrawParticipant(tournamentId, userId) {
    await pool.query(
      `UPDATE tournament_participants SET withdrawn = TRUE
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId]
    );
  }
  static async recordResult(tournamentId, userId, resultTimeSeconds, client = pool) {
    const result = await client.query(
      `UPDATE tournament_participants SET result_time_seconds = $3
       WHERE tournament_id = $1 AND user_id = $2 AND withdrawn = FALSE
       RETURNING *`,
      [tournamentId, userId, resultTimeSeconds]
    );
    return result.rows[0] || null;
  }
  /**
   * Records a finishing time and, once the tournament is completed, re-ranks everyone so a
   * correction cannot leave stale positions behind. Both happen in one transaction.
   * Returns null if the user is not an active participant.
   */
  static async recordResultAndRank(tournamentId, userId, resultTimeSeconds) {
    return withTransaction(async (client) => {
      const row = await Tournament.recordResult(tournamentId, userId, resultTimeSeconds, client);
      if (!row) return null;

      const current = await Tournament.findById(tournamentId, client);
      if (current?.status === 'completed') {
        await Tournament.recalculateRanks(tournamentId, client);
      }
      return row;
    });
  }

  static async recalculateRanks(tournamentId, client = pool) {
    await client.query(
      `UPDATE tournament_participants SET rank = NULL WHERE tournament_id = $1`,
      [tournamentId]
    );
    await client.query(
      `UPDATE tournament_participants tp
       SET rank = ranked.position
       FROM (
         SELECT user_id, RANK() OVER (ORDER BY result_time_seconds ASC) AS position
         FROM tournament_participants
         WHERE tournament_id = $1 AND withdrawn = FALSE AND result_time_seconds IS NOT NULL
       ) ranked
       WHERE tp.tournament_id = $1 AND tp.user_id = ranked.user_id`,
      [tournamentId]
    );
  }

  static async getStandings(tournamentId) {
    const result = await pool.query(
      `SELECT tp.user_id, u.name, tp.result_time_seconds, tp.rank, tp.withdrawn
       FROM tournament_participants tp
       JOIN users u ON u.user_id = tp.user_id
       WHERE tp.tournament_id = $1 AND tp.withdrawn = FALSE
       ORDER BY tp.rank ASC NULLS LAST, tp.result_time_seconds ASC NULLS LAST`,
      [tournamentId]
    );
    return result.rows;
  }

  static async getJoinedForUser(userId) {
    const result = await pool.query(
      `SELECT t.*, g.name AS group_name,
              (SELECT COUNT(*)::int FROM tournament_participants p
               WHERE p.tournament_id = t.tournament_id AND p.withdrawn = FALSE) AS participant_count
       FROM tournaments t
       JOIN tournament_participants tp ON tp.tournament_id = t.tournament_id
       JOIN groups g ON g.group_id = t.group_id
       WHERE tp.user_id = $1 AND tp.withdrawn = FALSE AND g.is_suspended = FALSE
       ORDER BY COALESCE(t.start_date, t.created_at) DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      ...new Tournament(row).toJSON(),
      groupName: row.group_name,
      participantCount: row.participant_count,
    }));
  }

  static async getCreatedForUser(userId) {
    const result = await pool.query(
      `SELECT t.*, g.name AS group_name,
              (SELECT COUNT(*)::int FROM tournament_participants p
               WHERE p.tournament_id = t.tournament_id AND p.withdrawn = FALSE) AS participant_count
       FROM tournaments t
       JOIN groups g ON g.group_id = t.group_id
       WHERE t.created_by = $1 AND g.is_suspended = FALSE
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      ...new Tournament(row).toJSON(),
      groupName: row.group_name,
      participantCount: row.participant_count,
    }));
  }

  static async getAvailableForUser(userId) {
    const result = await pool.query(
      `SELECT t.*, g.name AS group_name,
              COUNT(tp_all.user_id)::int AS participant_count
       FROM tournaments t
       JOIN groups g ON g.group_id = t.group_id
       JOIN group_members gm ON gm.group_id = t.group_id
         AND gm.user_id = $1 AND gm.status = 'active'
       LEFT JOIN tournament_participants mine ON mine.tournament_id = t.tournament_id
         AND mine.user_id = $1 AND mine.withdrawn = FALSE
       LEFT JOIN tournament_participants tp_all ON tp_all.tournament_id = t.tournament_id
         AND tp_all.withdrawn = FALSE
       WHERE g.is_suspended = FALSE
         AND t.status = 'open'
         AND (t.registration_deadline IS NULL OR t.registration_deadline >= NOW())
         AND mine.user_id IS NULL
       GROUP BY t.tournament_id, g.name
       HAVING t.max_participants IS NULL OR COUNT(tp_all.user_id) < t.max_participants
       ORDER BY COALESCE(t.start_date, t.created_at) ASC`,
      [userId]
    );
    return result.rows.map((row) => ({
      ...new Tournament(row).toJSON(),
      groupName: row.group_name,
      participantCount: row.participant_count,
    }));
  }

  static async getByGroupId(groupId) {
    const result = await pool.query(
      `SELECT * FROM tournaments WHERE group_id = $1 ORDER BY created_at DESC`,
      [groupId]
    );
    return result.rows.map((row) => new Tournament(row));
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'open')::int AS open,
              COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM tournaments`
    );
    const r = result.rows[0];
    return { total: r.total, open: r.open, inProgress: r.in_progress, completed: r.completed };
  }
}

export default Tournament;
