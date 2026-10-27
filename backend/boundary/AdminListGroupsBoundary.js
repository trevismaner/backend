import AdminListGroupsController from '../control/AdminListGroupsController.js';
import { paginationMeta, parseBoolean, parsePagination, readString, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminListGroupsController();

// GET /api/admin/groups?search=&suspended=true|false&page=&limit=
export default async function adminListGroupsBoundary(req, res) {
  try {
    const paging = parsePagination(req.query);
    const { groups, total } = await controller.listGroups({
      search: readString(req.query.search),
      isSuspended: parseBoolean(req.query.suspended),
      limit: paging.limit,
      offset: paging.offset,
    });
    return res.json({ groups, pagination: paginationMeta(paging, total) });
  } catch (err) {
    return sendError(res, err, 'list groups');
  }
}
