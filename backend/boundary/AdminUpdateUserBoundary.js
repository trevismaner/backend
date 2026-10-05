import AdminUpdateUserController from '../control/AdminUpdateUserController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdateUserController();

// PUT /api/admin/users/:userId   body: any of { name, email, password, bio }   (SA-06)
export default async function adminUpdateUserBoundary(req, res) {
  try {
    const user = await controller.updateUser({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      input: req.body ?? {},
    });
    return res.json({ message: 'User updated', user });
  } catch (err) {
    return sendError(res, err, 'admin update user');
  }
}
