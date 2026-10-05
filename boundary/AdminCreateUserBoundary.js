import AdminCreateUserController from '../control/AdminCreateUserController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminCreateUserController();

// POST /api/admin/users   body: { email, password, name, role? }
export default async function adminCreateUserBoundary(req, res) {
  try {
    const user = await controller.createUser({ adminId: getAdminId(req), input: req.body ?? {} });
    return res.status(201).json({ message: 'User created', user });
  } catch (err) {
    return sendError(res, err, 'create user');
  }
}
