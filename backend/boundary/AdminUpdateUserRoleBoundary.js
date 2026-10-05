import AdminUpdateUserRoleController from '../control/AdminUpdateUserRoleController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdateUserRoleController();

// PATCH /api/admin/users/:userId/role   body: { role }
export default async function adminUpdateUserRoleBoundary(req, res) {
  try {
    const user = await controller.updateRole({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      role: req.body?.role,
    });
    return res.json({ message: 'Role updated', user });
  } catch (err) {
    return sendError(res, err, 'update user role');
  }
}
