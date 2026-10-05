import AdminSendAnnouncementController from '../control/AdminSendAnnouncementController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminSendAnnouncementController();

// POST /api/admin/announcements   body: { title, body, role? }
export default async function adminSendAnnouncementBoundary(req, res) {
  try {
    const recipients = await controller.sendAnnouncement({ adminId: getAdminId(req), input: req.body ?? {} });
    return res.status(201).json({ message: 'Announcement sent', recipients });
  } catch (err) {
    return sendError(res, err, 'send announcement');
  }
}
