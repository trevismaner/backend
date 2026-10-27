import pool from '../config/db.js';

class Notification {
  static async create(userId, { type, title, body }, client = pool) {
    const result = await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, type, title, body]
    );
    return result.rows[0];
  }

  static async getForUser(userId, { limit = 30 } = {}) {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  static async markRead(notificationId, userId) {
    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result.rows[0] || null;
  }

  // Creates the default row on first use; safe if two requests arrive at once.
  static async getPreferences(userId) {
    const existing = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );
    if (existing.rows[0]) return existing.rows[0];

    await pool.query(
      `INSERT INTO user_notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const created = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );
    return created.rows[0];
  }

  static async updatePreferences(userId, prefs) {
    const current = await Notification.getPreferences(userId);
    const result = await pool.query(
      `UPDATE user_notification_preferences
       SET exercise_reminders = $2,
           overtraining_alerts = $3,
           tournament_updates = $4,
           reward_notifications = $5,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        prefs.exerciseReminders ?? current.exercise_reminders,
        prefs.overtrainingAlerts ?? current.overtraining_alerts,
        prefs.tournamentUpdates ?? current.tournament_updates,
        prefs.rewardNotifications ?? current.reward_notifications,
      ]
    );
    return result.rows[0];
  }

  // LEFT JOIN: users who never opened their preferences get the defaults (TRUE).
  static async getUsersWithNoRecentRun(daysThreshold) {
    const result = await pool.query(
      `SELECT u.user_id, u.push_token FROM users u
       LEFT JOIN user_notification_preferences p ON p.user_id = u.user_id
       WHERE COALESCE(p.exercise_reminders, TRUE) = TRUE
       AND u.is_suspended = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM runs r
         WHERE r.user_id = u.user_id
         AND r.started_at > NOW() - make_interval(days => $1::int)
       )`,
      [daysThreshold]
    );
    return result.rows;
  }

  static async getUsersWithHighRecentFrequency(runCountThreshold, windowDays) {
    const result = await pool.query(
      `SELECT u.user_id, u.push_token, COUNT(r.run_id)::int AS recent_run_count
       FROM users u
       LEFT JOIN user_notification_preferences p ON p.user_id = u.user_id
       JOIN runs r ON r.user_id = u.user_id
       WHERE COALESCE(p.overtraining_alerts, TRUE) = TRUE
       AND u.is_suspended = FALSE
       AND r.started_at > NOW() - make_interval(days => $2::int)
       GROUP BY u.user_id, u.push_token
       HAVING COUNT(r.run_id) >= $1`,
      [runCountThreshold, windowDays]
    );
    return result.rows;
  }

  // ---------- System admin operations ----------

  // Sends to every non-suspended user (optionally only one role). Returns recipient count.
  static async broadcast({ type = 'announcement', title, body, role }, client = pool) {
    const params = [type, title, body];
    let roleFilter = '';
    if (role) {
      params.push(role);
      roleFilter = 'AND role = $4';
    }
    const result = await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT user_id, $1, $2, $3 FROM users
       WHERE is_suspended = FALSE ${roleFilter}`,
      params
    );
    return result.rowCount;
  }

  static async createForGroupMembers(groupId, { type, title, body }, client = pool) {
    const result = await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT user_id, $2, $3, $4 FROM group_members
       WHERE group_id = $1 AND status = 'active'`,
      [groupId, type, title, body]
    );
    return result.rowCount;
  }
}

export default Notification;
