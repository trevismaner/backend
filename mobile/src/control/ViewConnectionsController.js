import Connection from '../entities/Connection.js';

async function viewConnectionsController() {
  try {
    const data = await Connection.list();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewConnectionsController;
