import AdminListUsersController from '../control/AdminListUsersController.js';
import { paginationMeta, parseBoolean, parsePagination, readString, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminListUsersController();

// GET /api/admin/users?search=&role=&suspended=true|false&page=&limit=
export default async function adminListUsersBoundary(req, res) {
  try {
    const paging = parsePagination(req.query);
    const { users, total } = await controller.listUsers({
      search: readString(req.query.search),
      role: readString(req.query.role),
      isSuspended: parseBoolean(req.query.suspended),
      limit: paging.limit,
      offset: paging.offset,
    });
    return res.json({ users, pagination: paginationMeta(paging, total) });
  } catch (err) {
    return sendError(res, err, 'list users');
  }
}
