import InstructorPost from '../entities/InstructorPost.js';

async function viewInstructorPostsController(filters = {}) {
  try {
    const data = await InstructorPost.getAll(filters);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewInstructorPostsController;
