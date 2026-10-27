import AdminViewPublicEventsController from '../control/AdminViewPublicEventsController.js';
import { getAdminId, paginationMeta, parsePagination, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminViewPublicEventsController();

// GET /api/admin/public-events?page=&limit=   (SA-13)
export default async function adminListPublicEventsBoundary(req, res) {
  try {
    const paging = parsePagination(req.query, 50);
    const { events, total } = await controller.listEvents({
      adminId: getAdminId(req),
      limit: paging.limit,
      offset: paging.offset,
    });
    return res.json({ events, pagination: paginationMeta(paging, total) });
  } catch (err) {
    return sendError(res, err, 'admin list public events');
  }
}
