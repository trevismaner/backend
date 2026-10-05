import AdminDeleteUserController from '../control/AdminDeleteUserController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminDeleteUserController();

// DELETE /api/admin/users/:userId
export default async function adminDeleteUserBoundary(req, res) {
  try {
    await controller.deleteUser({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
    });
    return res.json({ message: 'User deleted' });
  } catch (err) {
    return sendError(res, err, 'delete user');
  }
}
