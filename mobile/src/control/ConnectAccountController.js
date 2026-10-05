import Connection from '../entities/Connection.js';

async function connectAccountController(provider) {
  if (!provider) {
    return { success: false, field: 'provider', message: 'Choose a service to connect.' };
  }

  try {
    const data = await Connection.start(provider);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default connectAccountController;
