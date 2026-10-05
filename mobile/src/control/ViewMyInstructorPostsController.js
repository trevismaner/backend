import InstructorPost from '../entities/InstructorPost.js';

async function viewMyInstructorPostsController(options = {}) {
  try {
    const data = await InstructorPost.getMine(options);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewMyInstructorPostsController;
