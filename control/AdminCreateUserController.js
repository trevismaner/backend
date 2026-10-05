import bcrypt from 'bcryptjs';
import User from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateNewUser } from './AdminValidators.js';

const SALT_ROUNDS = 12;

export default class AdminCreateUserController {
  async createUser({ adminId, input }) {
    const { email, name, password, role } = validateNewUser(input);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    return guard(
      () =>
        withTransaction(async (client) => {
          if (await User.findByEmail(email, client)) {
            throw AdminError.conflict('Email is already registered');
          }
          const user = await User.create({ email, passwordHash, name, role }, client);
          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.CREATE_USER,
              targetUserId: user.userId,
              details: { email, role },
            },
            client
          );
          return user.toAdminJSON();
        }),
      { duplicate: 'Email is already registered' }
    );
  }
}
