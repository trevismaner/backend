import AdminSetGroupSuspensionController from '../control/AdminSetGroupSuspensionController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminSetGroupSuspensionController();

// PATCH /api/admin/groups/:groupId/suspension   body: { isSuspended: boolean, reason?: string }
export default async function adminSetGroupSuspensionBoundary(req, res) {
  try {
    const isSuspended = req.body?.isSuspended;
    const group = await controller.setSuspension({
      adminId: getAdminId(req),
      groupId: parseId(req.params.groupId, 'groupId'),
      isSuspended,
      reason: readReason(req.body),
    });
    return res.json({ message: isSuspended ? 'Group suspended' : 'Group reinstated', group });
  } catch (err) {
    return sendError(res, err, 'set group suspension');
  }
}
