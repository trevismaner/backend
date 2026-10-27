import AdminCreatePublicEventController from '../control/AdminCreatePublicEventController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminCreatePublicEventController();

// POST /api/admin/public-events   (SA-12)
// body: { name, description?, maxParticipants?, registrationDeadline?, startDate?, endDate? }
export default async function adminCreatePublicEventBoundary(req, res) {
  try {
    const event = await controller.createEvent({ adminId: getAdminId(req), input: req.body ?? {} });
    return res.status(201).json({ message: 'Public event created', event });
  } catch (err) {
    return sendError(res, err, 'admin create public event');
  }
}
