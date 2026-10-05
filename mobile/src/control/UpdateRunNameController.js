import Run from '../entities/Run.js';

async function updateRunNameController(runId, name) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Name cannot be empty.' };
  }

  try {
    const data = await Run.updateName(runId, name);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateRunNameController;
