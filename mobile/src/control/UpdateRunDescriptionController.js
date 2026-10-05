import Run from '../entities/Run.js';

async function updateRunDescriptionController(runId, description) {
  if (description && description.length > 1000) {
    return { success: false, field: 'description', message: 'Description exceeds character limit.' };
  }

  try {
    const data = await Run.updateDescription(runId, description);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateRunDescriptionController;
