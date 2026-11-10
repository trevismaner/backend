import AdminCreateGroupController from '../control/AdminCreateGroupController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminCreateGroupController();

// POST /api/admin/groups   body: { name, description?, isPrivate?, maxMembers?, ownerId? }
export default async function adminCreateGroupBoundary(req, res) {
  try {
    const group = await controller.createGroup({
      adminId: getAdminId(req),
      input: req.body ?? {},
    });
    return res.status(201).json({ message: 'Group created', group });
  } catch (err) {
    return sendError(res, err, 'admin create group');
  }
}
