import InstructorPost from '../entities/InstructorPost.js';

// IU-07 (own content): the instructor's own posts plus the counts shown on their dashboard.
// Unlike the public board this ignores verification, so an instructor can draft and manage
// content while their credentials are still under review.
async function viewMyInstructorPosts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const [{ posts, total }, stats] = await Promise.all([
      InstructorPost.findByAuthor(req.user.userId, { limit, offset: (page - 1) * limit }),
      InstructorPost.getStatsForAuthor(req.user.userId),
    ]);

    return res.status(200).json({
      posts,
      stats,
      // Lets the dashboard show a "pending review" banner without a second request.
      credentialsVerified: Boolean(req.user.credentialsVerified),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('View my instructor posts error:', err);
    return res.status(500).json({ error: 'Failed to load your posts' });
  }
}

export default viewMyInstructorPosts;
