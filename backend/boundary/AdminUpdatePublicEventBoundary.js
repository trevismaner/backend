import AdminUpdatePublicEventController from '../control/AdminUpdatePublicEventController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdatePublicEventController();

// PUT /api/admin/public-events/:eventId   (SA-14)
export default async function adminUpdatePublicEventBoundary(req, res) {
  try {
    const event = await controller.updateEvent({
      adminId: getAdminId(req),
      eventId: parseId(req.params.eventId, 'eventId'),
      input: req.body ?? {},
    });
    return res.json({ message: 'Public event updated', event });
  } catch (err) {
    return sendError(res, err, 'admin update public event');
  }
}
