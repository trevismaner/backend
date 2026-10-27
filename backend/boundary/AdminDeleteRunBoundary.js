import AdminDeleteRunController from '../control/AdminDeleteRunController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminDeleteRunController();

// DELETE /api/admin/runs/:runId   body (optional): { reason }
export default async function adminDeleteRunBoundary(req, res) {
  try {
    await controller.deleteRun({
      adminId: getAdminId(req),
      runId: parseId(req.params.runId, 'runId'),
      reason: readReason(req.body),
    });
    return res.json({ message: 'Run deleted' });
  } catch (err) {
    return sendError(res, err, 'delete run');
  }
}
