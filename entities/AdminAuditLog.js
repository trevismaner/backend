import pool from '../config/db.js';

export const ADMIN_ACTIONS = Object.freeze({
  // users
  CREATE_USER: 'CREATE_USER',
  SUSPEND_USER: 'SUSPEND_USER',
  UNSUSPEND_USER: 'UNSUSPEND_USER',
  CHANGE_ROLE: 'CHANGE_ROLE',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  VERIFY_INSTRUCTOR: 'VERIFY_INSTRUCTOR',
  UNVERIFY_INSTRUCTOR: 'UNVERIFY_INSTRUCTOR',
  // groups
  UPDATE_GROUP: 'UPDATE_GROUP',
  SUSPEND_GROUP: 'SUSPEND_GROUP',
  UNSUSPEND_GROUP: 'UNSUSPEND_GROUP',
  DELETE_GROUP: 'DELETE_GROUP',
  // rewards
  CREATE_REWARD: 'CREATE_REWARD',
  UPDATE_REWARD: 'UPDATE_REWARD',
  // badges
  CREATE_BADGE: 'CREATE_BADGE',
  UPDATE_BADGE: 'UPDATE_BADGE',
  DELETE_BADGE: 'DELETE_BADGE',
  AWARD_BADGE: 'AWARD_BADGE',
  REVOKE_BADGE: 'REVOKE_BADGE',
  // runs
  DELETE_RUN: 'DELETE_RUN',
  // public events (SA-12, SA-14, SA-15)
  CREATE_PUBLIC_EVENT: 'CREATE_PUBLIC_EVENT',
  UPDATE_PUBLIC_EVENT: 'UPDATE_PUBLIC_EVENT',
  DELETE_PUBLIC_EVENT: 'DELETE_PUBLIC_EVENT',
  // notifications
  SEND_ANNOUNCEMENT: 'SEND_ANNOUNCEMENT',
});

export const TARGET_TYPES = Object.freeze(['user', 'group', 'reward', 'badge', 'run', 'announcement', 'public_event']);

class AdminAuditLog {
  constructor(row) {
    this.logId = row.log_id;
    this.adminId = row.admin_id;
    this.adminName = row.admin_name ?? null;
    this.adminEmail = row.admin_email ?? null;
    this.action = row.action;
    this.targetType = row.target_type ?? null;
    this.targetId = row.target_id ?? null;
    this.targetUserId = row.target_user_id;
    this.details = row.details;
    this.createdAt = row.created_at;
  }

  /**
   * targetUserId: the affected user (if any).
   * targetType/targetId: the affected record; default to the user when only targetUserId is given.
   */
  static async record(
    {
      adminId,
      action,
      targetUserId = null,
      targetType = targetUserId != null ? 'user' : null,
      targetId = targetType === 'user' ? targetUserId : null,
      details = {},
    },
    client = pool
  ) {
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_user_id, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, action, targetUserId, targetType, targetId, details]
    );
  }

  static async list({ action, adminId, targetUserId, targetType, targetId, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} = $${params.length}`);
    };

    if (action) add('l.action', action);
    if (adminId) add('l.admin_id', adminId);
    if (targetUserId) add('l.target_user_id', targetUserId);
    if (targetType) add('l.target_type', targetType);
    if (targetId) add('l.target_id', targetId);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs l ${where}`,
      params
    );

    const pageParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT l.*, u.name AS admin_name, u.email AS admin_email
       FROM admin_audit_logs l
       LEFT JOIN users u ON u.user_id = l.admin_id
       ${where}
       ORDER BY l.created_at DESC, l.log_id DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    return {
      logs: result.rows.map((row) => new AdminAuditLog(row)),
      total: countResult.rows[0].total,
    };
  }
}

export default AdminAuditLog;
