import pool from '../config/db.js';
import { buildUpdate } from './buildUpdate.js';

/**
 * Instructor Board posts (instructor_posts table).
 *
 * Covers IU-05 create, IU-06 update, IU-07 read, IU-08 delete, and the read side of
 * RU-44 (registered users reading the board).
 *
 * Only posts written by a verified, non-suspended instructor are visible on the public
 * board — SA-11 exists "so that only qualified professionals can post on the Instructor
 * Board", and a suspended account (SA-05) takes its content off the board with it.
 * An instructor always sees their own posts, verified or not, so they can draft while
 * their credentials are still being reviewed.
 */

// Categories the board filters by. Kept here so the controllers and the board UI agree.
export const POST_CATEGORIES = Object.freeze(['training', 'nutrition', 'recovery', 'injury_prevention']);

class InstructorPost {
  constructor(row) {
    this.postId = row.post_id;
    this.authorId = row.author_id;
    this.title = row.title;
    this.content = row.content;
    this.category = row.category;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    // Present only on queries that join users.
    this.authorName = row.author_name ?? null;
    this.authorPhotoUrl = row.author_photo_url ?? null;
    this.authorVerified = row.author_verified ?? null;
    this.authorSuspended = row.author_suspended ?? null;
  }

  toJSON() {
    return {
      postId: this.postId,
      authorId: this.authorId,
      title: this.title,
      content: this.content,
      category: this.category,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      authorName: this.authorName,
      authorPhotoUrl: this.authorPhotoUrl,
      authorVerified: this.authorVerified,
    };
  }

  // Board list rows don't need the full body — just enough for a preview card.
  toSummaryJSON() {
    const text = this.content ?? '';
    return {
      postId: this.postId,
      authorId: this.authorId,
      title: this.title,
      excerpt: text.length > 180 ? `${text.slice(0, 177)}...` : text,
      category: this.category,
      readMinutes: Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200)),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      authorName: this.authorName,
      authorPhotoUrl: this.authorPhotoUrl,
      authorVerified: this.authorVerified,
    };
  }

  static async create({ authorId, title, content, category = null }) {
    const result = await pool.query(
      `INSERT INTO instructor_posts (author_id, title, content, category)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [authorId, title, content, category]
    );
    return new InstructorPost(result.rows[0]);
  }

  static async findById(postId) {
    const result = await pool.query(
      `SELECT p.*, u.name AS author_name, u.profile_photo_url AS author_photo_url,
              COALESCE(u.credentials_verified, FALSE) AS author_verified,
              u.is_suspended AS author_suspended
       FROM instructor_posts p
       JOIN users u ON u.user_id = p.author_id
       WHERE p.post_id = $1`,
      [postId]
    );
    return result.rows[0] ? new InstructorPost(result.rows[0]) : null;
  }

  /**
   * The public board (IU-07 / RU-44).
   * `viewerId` is always allowed to see their own posts even while unverified, so an
   * instructor reviewing the board sees their own drafts in place.
   */
  static async findAll({ category, search, viewerId = null, limit = 20, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    // Public board = verified, non-suspended authors. A suspended account is suspended for
    // a reason (SA-05), so its content comes off the board with it. The author themselves
    // is exempt so they keep seeing their own work.
    params.push(viewerId);
    conditions.push(
      `((COALESCE(u.credentials_verified, FALSE) = TRUE AND u.is_suspended = FALSE) OR p.author_id = $${params.length})`
    );

    if (category) {
      params.push(category);
      conditions.push(`p.category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.title ILIKE $${params.length} OR p.content ILIKE $${params.length})`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM instructor_posts p JOIN users u ON u.user_id = p.author_id ${where}`,
      params
    );

    const pageParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT p.*, u.name AS author_name, u.profile_photo_url AS author_photo_url,
              COALESCE(u.credentials_verified, FALSE) AS author_verified
       FROM instructor_posts p
       JOIN users u ON u.user_id = p.author_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    return {
      posts: result.rows.map((row) => new InstructorPost(row).toSummaryJSON()),
      total: countResult.rows[0].total,
    };
  }

  // An instructor's own posts, newest first (IU-07, "review my own content").
  static async findByAuthor(authorId, { limit = 50, offset = 0 } = {}) {
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM instructor_posts WHERE author_id = $1',
      [authorId]
    );
    const result = await pool.query(
      `SELECT p.*, u.name AS author_name, u.profile_photo_url AS author_photo_url,
              COALESCE(u.credentials_verified, FALSE) AS author_verified
       FROM instructor_posts p
       JOIN users u ON u.user_id = p.author_id
       WHERE p.author_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [authorId, limit, offset]
    );
    return {
      posts: result.rows.map((row) => new InstructorPost(row).toSummaryJSON()),
      total: countResult.rows[0].total,
    };
  }

  static async update(postId, data) {
    // buildUpdate skips undefined fields, so a partial edit only touches what changed.
    const { sets, values } = buildUpdate(
      { title: data.title, content: data.content, category: data.category },
      { title: 'title', content: 'content', category: 'category' }
    );
    if (sets.length === 0) return InstructorPost.findById(postId);

    const result = await pool.query(
      `UPDATE instructor_posts SET ${sets.join(', ')}, updated_at = NOW()
       WHERE post_id = $${values.length + 1}
       RETURNING *`,
      [...values, postId]
    );
    return result.rows[0] ? new InstructorPost(result.rows[0]) : null;
  }

  static async delete(postId) {
    const result = await pool.query('DELETE FROM instructor_posts WHERE post_id = $1', [postId]);
    return result.rowCount > 0;
  }

  // Counts for the instructor dashboard.
  static async getStatsForAuthor(authorId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total_posts,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS posts_last_30_days,
              COUNT(DISTINCT category)::int AS categories_used,
              MAX(created_at) AS last_posted_at
       FROM instructor_posts WHERE author_id = $1`,
      [authorId]
    );
    const r = result.rows[0];
    return {
      totalPosts: r.total_posts,
      postsLast30Days: r.posts_last_30_days,
      categoriesUsed: r.categories_used,
      lastPostedAt: r.last_posted_at,
    };
  }
}

export default InstructorPost;
