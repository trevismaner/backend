import InstructorPost from '../entities/InstructorPost.js';
import { ROLES } from '../entities/User.js';

// IU-08: As a Fitness Instructor, I want to delete my post on the Instructor Board, so that
// I can remove old content.
// SA-18 lets a system admin delete any post, so ownership is enforced for instructors only.
async function deleteInstructorPost(req, res) {
  try {
    const post = await InstructorPost.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (post.authorId !== req.user.userId && req.user.role !== ROLES.SYSTEM_ADMIN) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await InstructorPost.delete(req.params.postId);
    return res.status(200).json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete instructor post error:', err);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
}

export default deleteInstructorPost;
