import InstructorPost from '../entities/InstructorPost.js';

async function updateInstructorPostController({ postId, changes }) {
  if (!postId) {
    return { success: false, field: 'postId', message: 'A post id is required.' };
  }

  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'No changes to save.' };
  }

  if (changes.title !== undefined && !changes.title.trim()) {
    return { success: false, field: 'title', message: 'Title cannot be empty.' };
  }

  if (changes.content !== undefined && !changes.content.trim()) {
    return { success: false, field: 'content', message: 'Post content cannot be empty.' };
  }

  try {
    const data = await InstructorPost.update(postId, changes);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateInstructorPostController;
