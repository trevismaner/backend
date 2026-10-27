import AdminUpdateGroupController from '../control/AdminUpdateGroupController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdateGroupController();

// PUT /api/admin/groups/:groupId   body: any of { name, description, maxMembers }   (SA-21)
export default async function adminUpdateGroupBoundary(req, res) {
  try {
    const group = await controller.updateGroup({
      adminId: getAdminId(req),
      groupId: parseId(req.params.groupId, 'groupId'),
      input: req.body ?? {},
    });
    return res.json({ message: 'Group updated', group });
  } catch (err) {
    return sendError(res, err, 'admin update group');
  }
}
