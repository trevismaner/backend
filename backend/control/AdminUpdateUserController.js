import bcrypt from 'bcryptjs';
import User from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateUserEdit } from './AdminValidators.js';

const SALT_ROUNDS = 10;

/**
 * SA-06: As a System Admin, I want to update a user account, so that I can assist users who
 * are locked out of their account.
 *
 * That means the things that lock someone out: a mistyped email, a forgotten password, or a
 * name that needs correcting. Role and suspension have their own use cases (SA-05/SA-07),
 * so they are deliberately not editable here.
 */
export default class AdminUpdateUserController {
  async updateUser({ adminId, userId, input }) {
    const changes = validateUserEdit(input);

    return guard(
      () =>
        withTransaction(async (client) => {
          const user = await User.findById(userId, client, { forUpdate: true });
          if (!user) throw AdminError.notFound('User not found');

          // Email is unique, so check first to give a clear error rather than a 500.
          if (changes.email !== undefined) {
            const clash = await User.findByEmail(changes.email, client);
            if (clash && clash.userId !== user.userId) {
              throw AdminError.conflict('Another account already uses this email');
            }
          }

          const updated = await User.adminUpdate(
            userId,
            {
              name: changes.name,
              email: changes.email,
              bio: changes.bio,
              passwordHash:
                changes.password === undefined
                  ? undefined
                  : await bcrypt.hash(changes.password, SALT_ROUNDS),
            },
            client
          );

          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.UPDATE_USER,
              targetUserId: userId,
              // the password itself is never logged, only that it was reset
              details: {
                fields: Object.keys(changes)
                  .filter((k) => k !== 'password')
                  .concat(changes.password !== undefined ? ['password_reset'] : []),
              },
            },
            client
          );

          return updated.toAdminJSON();
        }),
      { duplicate: 'Another account already uses this email' }
    );
  }
}
