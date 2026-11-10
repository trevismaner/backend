import Connection from '../entities/Connection.js';

async function syncWearableController(provider) {
  if (!provider) {
    return { success: false, field: 'provider', message: 'Choose a device to sync.' };
  }

  try {
    const data = await Connection.sync(provider);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default syncWearableController;
