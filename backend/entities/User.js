import pool from '../config/db.js';
import { buildUpdate } from './buildUpdate.js';

export const ROLES = Object.freeze({
  REGISTERED_USER: 'registered_user',
  INSTRUCTOR: 'instructor',
  SYSTEM_ADMIN: 'system_admin',
});

class User {
  constructor(row) {
    this.userId = row.user_id;
    this.email = row.email;
    this.passwordHash = row.password_hash;
    this.name = row.name;
    this.role = row.role;
    this.isGroupAdmin = row.is_group_admin;
    this.isSuspended = row.is_suspended;
    this.profilePhotoUrl = row.profile_photo_url;
    this.bio = row.bio;
    this.credentialsVerified = row.credentials_verified;
    // migration 004 — what the instructor submitted for review (SA-11)
    this.credentialQualification = row.credential_qualification ?? null;
    this.credentialReference = row.credential_reference ?? null;
    this.credentialSubmittedAt = row.credential_submitted_at ?? null;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  /** What this instructor submitted, and where it is up to. */
  credentialStatus() {
    if (this.credentialsVerified) return 'verified';
    return this.credentialSubmittedAt ? 'pending' : 'not_submitted';
  }

  isSystemAdmin() {
    return this.role === ROLES.SYSTEM_ADMIN;
  }

  toJSON() {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      role: this.role,
      isGroupAdmin: this.isGroupAdmin,
      profilePhotoUrl: this.profilePhotoUrl,
      bio: this.bio,
      createdAt: this.createdAt,
    };
  }

  toSafeJSON() {
    return {
      userId: this.userId,
      name: this.name,
      profilePhotoUrl: this.profilePhotoUrl,
      isGroupAdmin: this.isGroupAdmin,
    };
  }

  // Full view for system admins (still never exposes passwordHash)
  toAdminJSON() {
    return {
      ...this.toJSON(),
      isSuspended: this.isSuspended,
      credentialsVerified: this.credentialsVerified,
      credentialQualification: this.credentialQualification,
      credentialReference: this.credentialReference,
      credentialSubmittedAt: this.credentialSubmittedAt,
      updatedAt: this.updatedAt,
    };
  }

  // `client` lets these run inside a transaction; defaults to the shared pool.
  static async findById(userId, client = pool, { forUpdate = false } = {}) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const result = await client.query(`SELECT * FROM users WHERE user_id = $1${lock}`, [userId]);
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async findByEmail(email, client = pool) {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async create({ email, passwordHash, name, role = ROLES.REGISTERED_USER }, client = pool) {
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, name, role]
    );
    return new User(result.rows[0]);
  }

  static async updateProfile(userId, { name, bio, profilePhotoUrl }) {
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           bio = COALESCE($3, bio),
           profile_photo_url = COALESCE($4, profile_photo_url),
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, name, bio, profilePhotoUrl]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async setSuspended(userId, isSuspended, client = pool) {
    const result = await client.query(
      `UPDATE users SET is_suspended = $2, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [userId, isSuspended]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async setPushToken(userId, pushToken) {
    await pool.query('UPDATE users SET push_token = $2 WHERE user_id = $1', [userId, pushToken]);
  }

  static async delete(userId, client = pool) {
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
  }

  // ---------- System admin operations ----------

  static async findAll({ search, role, isSuspended, limit = 20, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(email ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (typeof isSuspended === 'boolean') {
      params.push(isSuspended);
      conditions.push(`is_suspended = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users ${where}`,
      params
    );

    const pageParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT * FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    return {
      users: result.rows.map((row) => new User(row)),
      total: countResult.rows[0].total,
    };
  }

  static async setRole(userId, role, client = pool) {
    const result = await client.query(
      `UPDATE users SET role = $2, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [userId, role]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  // Locks all active system admin rows (in a consistent order to avoid deadlocks)
  // and returns how many there are. Must be called inside a transaction.
  /**
   * Admin edit of the fields that lock a user out (SA-06): name, email, password, bio.
   * Role and suspension have their own methods. Omitted fields are left unchanged.
   * Returns null if the user does not exist.
   */
  static async adminUpdate(userId, { name, email, passwordHash, bio }, client = pool) {
    const { sets, values } = buildUpdate(
      { name, email, passwordHash, bio },
      { name: 'name', email: 'email', passwordHash: 'password_hash', bio: 'bio' },
      2
    );
    if (!sets.length) return User.findById(userId, client);

    const result = await client.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, ...values]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  /**
   * IU-04: an instructor submits (or resubmits) their credentials for review.
   * Resubmitting clears any previous verification, since the details changed and the
   * admin needs to look again.
   */
  static async saveCredentials(userId, { qualification, reference }, client = pool) {
    const result = await client.query(
      `UPDATE users
       SET credential_qualification = $2,
           credential_reference = $3,
           credential_submitted_at = NOW(),
           credentials_verified = FALSE,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, qualification, reference]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async setCredentialsVerified(userId, verified, client = pool) {
    const result = await client.query(
      `UPDATE users SET credentials_verified = $2, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [userId, verified]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async lockActiveSystemAdmins(client) {
    const result = await client.query(
      `SELECT user_id FROM users
       WHERE role = $1 AND is_suspended = FALSE
       ORDER BY user_id
       FOR UPDATE`,
      [ROLES.SYSTEM_ADMIN]
    );
    return result.rowCount;
  }

  static async getStats() {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int                                                         AS total_users,
         COUNT(*) FILTER (WHERE role = $1)::int                                AS system_admins,
         COUNT(*) FILTER (WHERE role = 'instructor')::int                      AS instructors,
         COUNT(*) FILTER (WHERE role = 'instructor' AND NOT COALESCE(credentials_verified, FALSE))::int AS unverified_instructors,
         COUNT(*) FILTER (WHERE is_suspended)::int                             AS suspended_users,
         COUNT(*) FILTER (WHERE is_group_admin)::int                           AS group_admins,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS new_users_last_7_days,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_users_last_30_days
       FROM users`,
      [ROLES.SYSTEM_ADMIN]
    );
    const r = result.rows[0];
    return {
      totalUsers: r.total_users,
      systemAdmins: r.system_admins,
      instructors: r.instructors,
      unverifiedInstructors: r.unverified_instructors,
      suspendedUsers: r.suspended_users,
      groupAdmins: r.group_admins,
      newUsersLast7Days: r.new_users_last_7_days,
      newUsersLast30Days: r.new_users_last_30_days,
    };
  }
}

export default User;
