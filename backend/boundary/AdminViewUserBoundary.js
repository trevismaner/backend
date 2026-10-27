import AdminViewUserController from '../control/AdminViewUserController.js';
import { parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminViewUserController();

// GET /api/admin/users/:userId
export default async function adminViewUserBoundary(req, res) {
  try {
    const user = await controller.viewUser({ userId: parseId(req.params.userId, 'userId') });
    return res.json({ user });
  } catch (err) {
    return sendError(res, err, 'view user');
  }
}
