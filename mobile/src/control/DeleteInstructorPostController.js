import InstructorPost from '../entities/InstructorPost.js';

async function deleteInstructorPostController(postId) {
  if (!postId) {
    return { success: false, field: 'postId', message: 'A post id is required.' };
  }

  try {
    const data = await InstructorPost.delete(postId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default deleteInstructorPostController;
