import InstructorPost from '../entities/InstructorPost.js';

async function createInstructorPostController({ title, content, category = null }) {
  if (!title || !title.trim()) {
    return { success: false, field: 'title', message: 'A title is required.' };
  }

  if (title.trim().length > 200) {
    return { success: false, field: 'title', message: 'Title must be 200 characters or fewer.' };
  }

  if (!content || !content.trim()) {
    return { success: false, field: 'content', message: 'Post content cannot be empty.' };
  }

  try {
    const data = await InstructorPost.create({ title: title.trim(), content: content.trim(), category });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default createInstructorPostController;
