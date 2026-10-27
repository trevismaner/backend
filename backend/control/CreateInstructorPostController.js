import InstructorPost, { POST_CATEGORIES } from '../entities/InstructorPost.js';

// IU-05: As a Fitness Instructor, I want to create a new post, so that I can share
// professional guidance with users.
async function createInstructorPost(req, res) {
  try {
    const { title, content, category } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
    }
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (category != null && !POST_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${POST_CATEGORIES.join(', ')}` });
    }

    const post = await InstructorPost.create({
      authorId: req.user.userId,
      title: title.trim(),
      content: content.trim(),
      category: category ?? null,
    });

    return res.status(201).json({ post: post.toJSON() });
  } catch (err) {
    console.error('Create instructor post error:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
}

export default createInstructorPost;
