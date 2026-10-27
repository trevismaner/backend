import InstructorPost, { POST_CATEGORIES } from '../entities/InstructorPost.js';
import { ROLES } from '../entities/User.js';

// IU-06: As a Fitness Instructor, I want to update my post, so that I can correct or
// improve my content.
// SA-17 lets a system admin update any post, so ownership is enforced for instructors only.
async function updateInstructorPost(req, res) {
  try {
    const { title, content, category } = req.body;

    if (title === undefined && content === undefined && category === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    if (title !== undefined && (!title || title.trim() === '')) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    if (title !== undefined && title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
    }
    if (content !== undefined && (!content || content.trim() === '')) {
      return res.status(400).json({ error: 'Content cannot be empty' });
    }
    if (category !== undefined && category !== null && !POST_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${POST_CATEGORIES.join(', ')}` });
    }

    const post = await InstructorPost.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (post.authorId !== req.user.userId && req.user.role !== ROLES.SYSTEM_ADMIN) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    const updated = await InstructorPost.update(req.params.postId, {
      title: title === undefined ? undefined : title.trim(),
      content: content === undefined ? undefined : content.trim(),
      category,
    });

    return res.status(200).json({ post: updated.toJSON() });
  } catch (err) {
    console.error('Update instructor post error:', err);
    return res.status(500).json({ error: 'Failed to update post' });
  }
}

export default updateInstructorPost;
