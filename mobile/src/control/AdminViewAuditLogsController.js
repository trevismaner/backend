import Admin from '../entities/Admin.js';

async function adminViewAuditLogsController(filters = {}) {
  try {
    const data = await Admin.getAuditLogs(filters);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminViewAuditLogsController;
