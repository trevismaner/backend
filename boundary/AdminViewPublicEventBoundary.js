import AdminViewPublicEventsController from '../control/AdminViewPublicEventsController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminViewPublicEventsController();

// GET /api/admin/public-events/:eventId   (SA-13)
export default async function adminViewPublicEventBoundary(req, res) {
  try {
    const result = await controller.viewEvent({
      adminId: getAdminId(req),
      eventId: parseId(req.params.eventId, 'eventId'),
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err, 'admin view public event');
  }
}
