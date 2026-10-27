import AdminDeleteGroupController from '../control/AdminDeleteGroupController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminDeleteGroupController();

// DELETE /api/admin/groups/:groupId   body (optional): { reason }
export default async function adminDeleteGroupBoundary(req, res) {
  try {
    await controller.deleteGroup({
      adminId: getAdminId(req),
      groupId: parseId(req.params.groupId, 'groupId'),
      reason: readReason(req.body),
    });
    return res.json({ message: 'Group deleted' });
  } catch (err) {
    return sendError(res, err, 'delete group');
  }
}
