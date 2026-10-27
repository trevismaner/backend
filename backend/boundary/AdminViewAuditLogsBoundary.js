import AdminViewAuditLogsController from '../control/AdminViewAuditLogsController.js';
import {
  paginationMeta,
  parseOptionalId,
  parsePagination,
  readString,
  sendError,
} from './AdminBoundaryHelpers.js';

const controller = new AdminViewAuditLogsController();

// GET /api/admin/audit-logs?action=&adminId=&targetUserId=&targetType=&targetId=&page=&limit=
export default async function adminViewAuditLogsBoundary(req, res) {
  try {
    const paging = parsePagination(req.query, 50);
    const { logs, total } = await controller.viewAuditLogs({
      action: readString(req.query.action),
      targetType: readString(req.query.targetType),
      adminId: parseOptionalId(req.query.adminId, 'adminId'),
      targetUserId: parseOptionalId(req.query.targetUserId, 'targetUserId'),
      targetId: parseOptionalId(req.query.targetId, 'targetId'),
      limit: paging.limit,
      offset: paging.offset,
    });
    return res.json({ logs, pagination: paginationMeta(paging, total) });
  } catch (err) {
    return sendError(res, err, 'view audit logs');
  }
}
