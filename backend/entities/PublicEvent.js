import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';
import { buildUpdate } from './buildUpdate.js';

/**
 * Platform-wide events (public_events / public_event_participants).
 *
 * Runners read (RU-39), join (RU-40) and withdraw (RU-43); system admins create and manage
 * them (SA-12 to SA-15). Unlike tournaments these belong to no group — anyone can enter.
 *
 * Status is derived from the dates rather than stored, so it can never drift out of date:
 *   upcoming   registration still open
 *   closed     deadline passed, event not started
 *   in_progress started, not finished
 *   completed  end date passed
 */

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

function deriveStatus(row, now = new Date()) {
  const start = row.start_date ? new Date(row.start_date) : null;
  const end = row.end_date ? new Date(row.end_date) : start;
  const deadline = row.registration_deadline ? new Date(row.registration_deadline) : null;

  if (end && now > end) return 'completed';
  if (start && now >= start) return 'in_progress';
  if (deadline && now > deadline) return 'closed';
  return 'upcoming';
}

class PublicEvent {
  constructor(row) {
    this.eventId = row.event_id;
    this.createdBy = row.created_by;
    this.name = row.name;
    this.description = row.description;
    this.maxParticipants = row.max_participants;
    this.registrationDeadline = row.registration_deadline;
    this.startDate = row.start_date;
    this.endDate = row.end_date;
    this.createdAt = row.created_at;
    // from joins
    this.participantCount = row.participant_count ?? null;
    this.creatorName = row.creator_name ?? null;
    this.isRegistered = row.is_registered ?? null;
    this.hasWithdrawn = row.has_withdrawn ?? null;
    this.status = deriveStatus(row);
  }

  toJSON() {
    return {
      eventId: this.eventId,
      name: this.name,
      description: this.description,
      maxParticipants: this.maxParticipants,
      registrationDeadline: this.registrationDeadline,
      startDate: this.startDate,
      endDate: this.endDate,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      creatorName: this.creatorName,
      participantCount: this.participantCount,
      isRegistered: this.isRegistered,
      hasWithdrawn: this.hasWithdrawn,
      status: this.status,
      // A place is only open while registration is running and there is room.
      spotsRemaining:
        this.maxParticipants == null ? null : Math.max(0, this.maxParticipants - (this.participantCount ?? 0)),
      registrationOpen: this.status === 'upcoming',
    };
  }

  // Columns every read needs: counts, creator, and whether *this* viewer is in it.
  static get selectWithViewer() {
    return `SELECT e.*, u.name AS creator_name,
              (SELECT COUNT(*)::int FROM public_event_participants p
                WHERE p.event_id = e.event_id AND p.withdrawn = FALSE) AS participant_count,
              EXISTS (SELECT 1 FROM public_event_participants p
                WHERE p.event_id = e.event_id AND p.user_id = $1 AND p.withdrawn = FALSE) AS is_registered,
              EXISTS (SELECT 1 FROM public_event_participants p
                WHERE p.event_id = e.event_id AND p.user_id = $1 AND p.withdrawn = TRUE) AS has_withdrawn
       FROM public_events e
       LEFT JOIN users u ON u.user_id = e.created_by`;
  }

  // RU-39 / SA-13
  static async findAll({ viewerId, limit = 50, offset = 0 } = {}) {
    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM public_events');
    const result = await pool.query(
      `${PublicEvent.selectWithViewer}
       ORDER BY e.start_date DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [viewerId, limit, offset]
    );
    return {
      events: result.rows.map((row) => new PublicEvent(row).toJSON()),
      total: countResult.rows[0].total,
    };
  }

  static async findById(eventId, viewerId, client = pool) {
    const result = await client.query(
      `${PublicEvent.selectWithViewer} WHERE e.event_id = $2`,
      [viewerId, eventId]
    );
    return result.rows[0] ? new PublicEvent(result.rows[0]) : null;
  }

  // The leaderboard for a finished event, and the entry list before that.
  static async getParticipants(eventId) {
    const result = await pool.query(
      `SELECT p.user_id, p.result_time_seconds, p.rank, p.withdrawn, p.registered_at,
              u.name, u.profile_photo_url
       FROM public_event_participants p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.event_id = $1 AND p.withdrawn = FALSE
       ORDER BY p.rank ASC NULLS LAST, p.registered_at ASC`,
      [eventId]
    );
    return result.rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      profilePhotoUrl: r.profile_photo_url,
      resultTimeSeconds: r.result_time_seconds,
      rank: r.rank,
      registeredAt: r.registered_at,
    }));
  }

  /**
   * RU-40. Capacity is checked inside the transaction with the row locked, so two people
   * taking the last place at the same moment can't both get in.
   * A previous withdrawal is flipped back rather than inserted again.
   */
  static async join(eventId, userId) {
    return withTransaction(async (client) => {
      const eventResult = await client.query(
        'SELECT * FROM public_events WHERE event_id = $1 FOR UPDATE',
        [eventId]
      );
      const event = eventResult.rows[0];
      if (!event) return { ok: false, reason: 'not_found' };

      if (deriveStatus(event) !== 'upcoming') return { ok: false, reason: 'closed' };

      const existing = await client.query(
        'SELECT withdrawn FROM public_event_participants WHERE event_id = $1 AND user_id = $2',
        [eventId, userId]
      );
      if (existing.rows[0] && existing.rows[0].withdrawn === false) {
        return { ok: false, reason: 'already_joined' };
      }

      if (event.max_participants != null) {
        const countResult = await client.query(
          'SELECT COUNT(*)::int AS c FROM public_event_participants WHERE event_id = $1 AND withdrawn = FALSE',
          [eventId]
        );
        if (countResult.rows[0].c >= event.max_participants) return { ok: false, reason: 'full' };
      }

      if (existing.rows[0]) {
        await client.query(
          `UPDATE public_event_participants
           SET withdrawn = FALSE, registered_at = NOW()
           WHERE event_id = $1 AND user_id = $2`,
          [eventId, userId]
        );
      } else {
        await client.query(
          'INSERT INTO public_event_participants (event_id, user_id) VALUES ($1, $2)',
          [eventId, userId]
        );
      }
      return { ok: true };
    });
  }

  // RU-43 — only before the event starts, so a place can still be reused.
  static async withdraw(eventId, userId) {
    return withTransaction(async (client) => {
      const eventResult = await client.query(
        'SELECT * FROM public_events WHERE event_id = $1 FOR UPDATE',
        [eventId]
      );
      const event = eventResult.rows[0];
      if (!event) return { ok: false, reason: 'not_found' };

      const status = deriveStatus(event);
      if (status === 'in_progress' || status === 'completed') {
        return { ok: false, reason: 'already_started' };
      }

      const result = await client.query(
        `UPDATE public_event_participants SET withdrawn = TRUE
         WHERE event_id = $1 AND user_id = $2 AND withdrawn = FALSE`,
        [eventId, userId]
      );
      if (result.rowCount === 0) return { ok: false, reason: 'not_registered' };
      return { ok: true };
    });
  }

  // ---------- System admin operations (SA-12, SA-14, SA-15) ----------

  static async create({ createdBy, name, description, maxParticipants, registrationDeadline, startDate, endDate }, client = pool) {
    const result = await client.query(
      `INSERT INTO public_events (created_by, name, description, max_participants, registration_deadline, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [createdBy, name, description, maxParticipants, registrationDeadline, startDate, endDate]
    );
    return new PublicEvent(result.rows[0]);
  }

  static async update(eventId, data, client = pool) {
    const { sets, values } = buildUpdate(
      {
        name: data.name,
        description: data.description,
        maxParticipants: data.maxParticipants,
        registrationDeadline: data.registrationDeadline,
        startDate: data.startDate,
        endDate: data.endDate,
      },
      {
        name: 'name',
        description: 'description',
        maxParticipants: 'max_participants',
        registrationDeadline: 'registration_deadline',
        startDate: 'start_date',
        endDate: 'end_date',
      }
    );
    if (sets.length === 0) {
      const current = await client.query('SELECT * FROM public_events WHERE event_id = $1', [eventId]);
      return current.rows[0] ? new PublicEvent(current.rows[0]) : null;
    }

    const result = await client.query(
      `UPDATE public_events SET ${sets.join(', ')} WHERE event_id = $${values.length + 1} RETURNING *`,
      [...values, eventId]
    );
    return result.rows[0] ? new PublicEvent(result.rows[0]) : null;
  }

  static async delete(eventId, client = pool) {
    // Participants go with it via ON DELETE CASCADE.
    const result = await client.query('DELETE FROM public_events WHERE event_id = $1', [eventId]);
    return result.rowCount > 0;
  }

  static async exists(eventId, client = pool) {
    const result = await client.query('SELECT 1 FROM public_events WHERE event_id = $1', [eventId]);
    return result.rowCount > 0;
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE start_date > NOW())::int AS upcoming,
              (SELECT COUNT(*)::int FROM public_event_participants WHERE withdrawn = FALSE) AS registrations
       FROM public_events`
    );
    return result.rows[0];
  }
}

export { deriveStatus };
export default PublicEvent;
