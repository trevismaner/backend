import { withTransaction } from '../config/transaction.js';
import User, { ROLES } from '../entities/User.js';

// Domain error kinds. The boundary layer decides which HTTP status each maps to.
export const ERROR_TYPES = Object.freeze({
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
});

export class AdminError extends Error {
  constructor(type, message) {
    super(message);
    this.name = 'AdminError';
    this.type = type;
  }

  static validation(message) {
    return new AdminError(ERROR_TYPES.VALIDATION, message);
  }

  static notFound(message) {
    return new AdminError(ERROR_TYPES.NOT_FOUND, message);
  }

  static conflict(message) {
    return new AdminError(ERROR_TYPES.CONFLICT, message);
  }

  static forbidden(message) {
    return new AdminError(ERROR_TYPES.FORBIDDEN, message);
  }
}

export { withTransaction };

// Turns known PostgreSQL errors into AdminErrors; anything else is rethrown unchanged.
export function translateDbError(err, messages = {}) {
  if (err instanceof AdminError) return err;
  switch (err.code) {
    case '22P02':
      return AdminError.validation(messages.invalid ?? 'Invalid identifier format');
    case '23505':
      return AdminError.conflict(messages.duplicate ?? 'A record with these details already exists');
    case '23503':
      return AdminError.conflict(
        messages.referenced ??
          'This record is still referenced by other data. Deactivate or suspend it instead, or remove the related data first.'
      );
    case '23514':
      return AdminError.validation(messages.check ?? 'Value not allowed');
    default:
      return err;
  }
}

// Runs a use case and translates database errors on the way out.
export async function guard(fn, messages) {
  try {
    return await fn();
  } catch (err) {
    throw translateDbError(err, messages);
  }
}

export function assertNotSelf(adminId, userId, message) {
  if (String(adminId) === String(userId)) throw AdminError.validation(message);
}

/**
 * Locks admin rows first, then the target row, and returns the target
 * together with the number of active system admins.
 * Consistent lock order prevents deadlocks between concurrent admin actions.
 */
export async function lockTargetUser(client, userId) {
  const activeAdminCount = await User.lockActiveSystemAdmins(client);
  const target = await User.findById(userId, client, { forUpdate: true });
  if (!target) throw AdminError.notFound('User not found');
  return { target, activeAdminCount };
}

export function assertNotLastActiveAdmin(target, activeAdminCount) {
  const isActiveAdmin = target.role === ROLES.SYSTEM_ADMIN && !target.isSuspended;
  if (isActiveAdmin && activeAdminCount <= 1) {
    throw AdminError.conflict('This action would leave the system without an active system admin');
  }
}
