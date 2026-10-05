import AdminSetUserSuspensionController from '../control/AdminSetUserSuspensionController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminSetUserSuspensionController();

// PATCH /api/admin/users/:userId/suspension   body: { isSuspended: boolean, reason?: string }
export default async function adminSetUserSuspensionBoundary(req, res) {
  try {
    const isSuspended = req.body?.isSuspended;
    const user = await controller.setSuspension({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      isSuspended,
      reason: readReason(req.body),
    });
    return res.json({ message: isSuspended ? 'User suspended' : 'User reactivated', user });
  } catch (err) {
    return sendError(res, err, 'set user suspension');
  }
}
