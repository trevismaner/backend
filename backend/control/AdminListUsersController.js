import User from '../entities/User.js';
import { guard } from './AdminControlHelpers.js';
import { requireRole } from './AdminValidators.js';

export default class AdminListUsersController {
  async listUsers({ search, role, isSuspended, limit, offset }) {
    if (role) requireRole(role);
    return guard(async () => {
      const { users, total } = await User.findAll({
        search: search?.trim() || undefined,
        role,
        isSuspended,
        limit,
        offset,
      });
      return { users: users.map((u) => u.toAdminJSON()), total };
    });
  }
}
