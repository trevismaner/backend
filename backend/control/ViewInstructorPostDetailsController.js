import InstructorPost from '../entities/InstructorPost.js';

// IU-07 (single post) / RU-44: read one post in full.
// An unverified instructor's post is hidden from everyone except its own author, matching
// the visibility rule used by the board listing.
async function viewInstructorPostDetails(req, res) {
  try {
    const post = await InstructorPost.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Same visibility rule as the board listing: unverified or suspended authors are
    // hidden from everyone except themselves.
    const isAuthor = post.authorId === req.user.userId;
    if ((!post.authorVerified || post.authorSuspended) && !isAuthor) {
      return res.status(404).json({ error: 'Post not found' });
    }

    return res.status(200).json({ post: post.toJSON(), isAuthor });
  } catch (err) {
    console.error('View instructor post details error:', err);
    return res.status(500).json({ error: 'Failed to load post' });
  }
}

export default viewInstructorPostDetails;
