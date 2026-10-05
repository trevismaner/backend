import AdminListRunsController from '../control/AdminListRunsController.js';
import {
  paginationMeta,
  parseOptionalId,
  parseOptionalNumber,
  parsePagination,
  sendError,
} from './AdminBoundaryHelpers.js';

const controller = new AdminListRunsController();

// GET /api/admin/runs?userId=&minDistanceKm=&maxPaceSecondsPerKm=&page=&limit=
export default async function adminListRunsBoundary(req, res) {
  try {
    const paging = parsePagination(req.query);
    const { runs, total } = await controller.listRuns({
      userId: parseOptionalId(req.query.userId, 'userId'),
      minDistanceKm: parseOptionalNumber(req.query.minDistanceKm, 'minDistanceKm'),
      maxPaceSecondsPerKm: parseOptionalNumber(req.query.maxPaceSecondsPerKm, 'maxPaceSecondsPerKm'),
      limit: paging.limit,
      offset: paging.offset,
    });
    return res.json({ runs, pagination: paginationMeta(paging, total) });
  } catch (err) {
    return sendError(res, err, 'list runs');
  }
}
