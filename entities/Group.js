import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';
import { buildUpdate } from './buildUpdate.js';

class Group {
  constructor(row) {
    this.groupId = row.group_id;
    this.name = row.name;
    this.description = row.description;
    this.isPrivate = row.is_private;
    this.maxMembers = row.max_members;
    this.createdBy = row.created_by;
    this.isSuspended = row.is_suspended;
    this.createdAt = row.created_at;
  }

  toJSON() {
    return {
      groupId: this.groupId,
      name: this.name,
      description: this.description,
      isPrivate: this.isPrivate,
      maxMembers: this.maxMembers,
      createdBy: this.createdBy,
      isSuspended: this.isSuspended,
      createdAt: this.createdAt,
    };
  }

  // Group and its creator's admin membership are created together or not at all.
  static async create({ name, description, isPrivate, maxMembers, createdBy }) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO groups (name, description, is_private, max_members, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, description ?? null, !!isPrivate, maxMembers ?? null, createdBy]
      );
      const group = new Group(result.rows[0]);
      await client.query(
        `INSERT INTO group_members (group_id, user_id, is_admin, status)
         VALUES ($1, $2, TRUE, 'active')`,
        [group.groupId, createdBy]
      );
      return group;
    });
  }

  static async findById(groupId, client = pool, { forUpdate = false } = {}) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const result = await client.query(`SELECT * FROM groups WHERE group_id = $1${lock}`, [groupId]);
    return result.rows[0] ? new Group(result.rows[0]) : null;
  }

  static async findByName(name, client = pool) {
    const result = await client.query('SELECT * FROM groups WHERE name = $1', [name]);
    return result.rows[0] ? new Group(result.rows[0]) : null;
  }

  static async search(searchTerm) {
    const result = await pool.query(
      `SELECT * FROM groups WHERE name ILIKE $1 AND is_suspended = FALSE ORDER BY name`,
      [`%${searchTerm}%`]
    );
    return result.rows.map((row) => new Group(row));
  }

  // Omitted (undefined) fields are left alone; null clears a field.
  static async update(groupId, data, client = pool) {
    const { sets, values } = buildUpdate(
      data,
      { name: 'name', description: 'description', maxMembers: 'max_members' },
      2
    );
    if (!sets.length) return Group.findById(groupId, client);
    const result = await client.query(
      `UPDATE groups SET ${sets.join(', ')} WHERE group_id = $1 RETURNING *`,
      [groupId, ...values]
    );
    return result.rows[0] ? new Group(result.rows[0]) : null;
  }

  static async countActiveMembers(groupId, client = pool) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM group_members WHERE group_id = $1 AND status = 'active'`,
      [groupId]
    );
    return result.rows[0].count;
  }

  static async getMembership(groupId, userId) {
    const result = await pool.query(
      `SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    return result.rows[0] || null;
  }

  static async isAdmin(groupId, userId) {
    const membership = await Group.getMembership(groupId, userId);
    return !!membership && membership.is_admin && membership.status === 'active';
  }

  // Never downgrades an existing active member (e.g. back to 'pending').
  static async addMember(groupId, userId, status = 'active', client = pool) {
    await client.query(
      `INSERT INTO group_members (group_id, user_id, is_admin, status)
       VALUES ($1, $2, FALSE, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET status = EXCLUDED.status
       WHERE group_members.status <> 'active'`,
      [groupId, userId, status]
    );
  }

  /**
   * Safe join: locks the group so two people can't take the last place at once.
   * Returns { ok: true } or { ok: false, reason: 'not_found' | 'suspended' | 'full' }.
   * Capacity is only checked when adding an active member (not for pending requests).
   */
  static async addMemberWithCapacity(groupId, userId, status = 'active') {
    return withTransaction(async (client) => {
      const group = await Group.findById(groupId, client, { forUpdate: true });
      if (!group) return { ok: false, reason: 'not_found' };
      if (group.isSuspended) return { ok: false, reason: 'suspended' };

      if (status === 'active' && group.maxMembers != null) {
        const existing = await client.query(
          `SELECT status FROM group_members WHERE group_id = $1 AND user_id = $2`,
          [groupId, userId]
        );
        const alreadyActive = existing.rows[0]?.status === 'active';
        const count = await Group.countActiveMembers(groupId, client);
        if (!alreadyActive && count >= group.maxMembers) return { ok: false, reason: 'full' };
      }

      await Group.addMember(groupId, userId, status, client);
      return { ok: true };
    });
  }

  static async removeMember(groupId, userId) {
    await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  }

  static async promoteMember(groupId, userId) {
    await pool.query(
      `UPDATE group_members SET is_admin = TRUE WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
  }

  static async setMemberStatus(groupId, userId, status) {
    await pool.query(
      `UPDATE group_members SET status = $3 WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId, status]
    );
  }

  static async getMembers(groupId) {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.profile_photo_url, gm.is_admin, gm.status
       FROM group_members gm
       JOIN users u ON u.user_id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.is_admin DESC, u.name ASC`,
      [groupId]
    );
    return result.rows;
  }

  // Includes suspended groups (flagged via isSuspended) so users can see why a group is unavailable.
  static async getGroupsForUser(userId) {
    const result = await pool.query(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.group_id
       WHERE gm.user_id = $1 AND gm.status = 'active'
       ORDER BY g.name`,
      [userId]
    );
    return result.rows.map((row) => new Group(row));
  }

  // ---------- System admin operations ----------

  static async findAllForAdmin({ search, isSuspended, limit = 20, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`g.name ILIKE $${params.length}`);
    }
    if (typeof isSuspended === 'boolean') {
      params.push(isSuspended);
      conditions.push(`g.is_suspended = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM groups g ${where}`, params);

    const pageParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT g.*, u.name AS creator_name,
              (SELECT COUNT(*)::int FROM group_members gm
               WHERE gm.group_id = g.group_id AND gm.status = 'active') AS member_count
       FROM groups g
       LEFT JOIN users u ON u.user_id = g.created_by
       ${where}
       ORDER BY g.created_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    return {
      groups: result.rows.map((row) => ({
        ...new Group(row).toJSON(),
        creatorName: row.creator_name,
        memberCount: row.member_count,
      })),
      total: countResult.rows[0].total,
    };
  }

  static async setSuspended(groupId, isSuspended, client = pool) {
    const result = await client.query(
      `UPDATE groups SET is_suspended = $2 WHERE group_id = $1 RETURNING *`,
      [groupId, isSuspended]
    );
    return result.rows[0] ? new Group(result.rows[0]) : null;
  }

  // Members and tournaments are removed by ON DELETE CASCADE.
  static async delete(groupId, client = pool) {
    const result = await client.query('DELETE FROM groups WHERE group_id = $1', [groupId]);
    return result.rowCount > 0;
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_suspended)::int AS suspended,
              COUNT(*) FILTER (WHERE is_private)::int AS private
       FROM groups`
    );
    return result.rows[0];
  }
}

export default Group;
