import InstructorPost, { POST_CATEGORIES } from '../entities/InstructorPost.js';

// IU-07: As a Fitness Instructor, I want to read posts on the Instructor Board, so that I
// can review my own and others' content.
// Same endpoint serves RU-44 (a Registered User reading the board).
async function viewInstructorPosts(req, res) {
  try {
    const { category, search } = req.query;

    if (category && !POST_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${POST_CATEGORIES.join(', ')}` });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const { posts, total } = await InstructorPost.findAll({
      category: category || undefined,
      search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
      viewerId: req.user.userId,
      limit,
      offset: (page - 1) * limit,
    });

    return res.status(200).json({
      posts,
      categories: POST_CATEGORIES,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('View instructor posts error:', err);
    return res.status(500).json({ error: 'Failed to load Instructor Board' });
  }
}

export default viewInstructorPosts;
