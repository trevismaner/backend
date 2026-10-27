import { AdminError, ERROR_TYPES } from '../control/AdminControlHelpers.js';

const HTTP_STATUS = Object.freeze({
  [ERROR_TYPES.VALIDATION]: 400,
  [ERROR_TYPES.FORBIDDEN]: 403,
  [ERROR_TYPES.NOT_FOUND]: 404,
  [ERROR_TYPES.CONFLICT]: 409,
});

// Converts an error from the control layer into an HTTP response.
export function sendError(res, err, context) {
  if (err instanceof AdminError) {
    return res.status(HTTP_STATUS[err.type] ?? 400).json({ error: err.message });
  }
  console.error(`[admin] ${context}:`, err);
  return res.status(500).json({ error: 'Internal server error' });
}

// The logged-in admin, attached by requireSystemAdmin.
export const getAdminId = (req) => req.admin.userId;

export function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

export function paginationMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export function parseBoolean(value) {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

// All ids in the schema are SERIAL integers.
export function parseId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw AdminError.validation(`${label} must be a positive integer`);
  }
  return id;
}

export function parseOptionalId(value, label) {
  return value === undefined || value === '' ? undefined : parseId(value, label);
}

export function parseOptionalNumber(value, label) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw AdminError.validation(`${label} must be a non-negative number`);
  }
  return n;
}

export function readString(value) {
  return typeof value === 'string' ? value : undefined;
}

export function readReason(body) {
  return typeof body?.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 500)
    : null;
}
