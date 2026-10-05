import AdminDeletePublicEventController from '../control/AdminDeletePublicEventController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminDeletePublicEventController();

// DELETE /api/admin/public-events/:eventId   (SA-15)
export default async function adminDeletePublicEventBoundary(req, res) {
  try {
    await controller.deleteEvent({
      adminId: getAdminId(req),
      eventId: parseId(req.params.eventId, 'eventId'),
    });
    return res.json({ message: 'Public event deleted' });
  } catch (err) {
    return sendError(res, err, 'admin delete public event');
  }
}
