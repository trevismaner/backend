import Connection from '../entities/Connection.js';

async function disconnectAccountController(provider) {
  if (!provider) {
    return { success: false, field: 'provider', message: 'Choose a service to disconnect.' };
  }

  try {
    const data = await Connection.disconnect(provider);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default disconnectAccountController;
