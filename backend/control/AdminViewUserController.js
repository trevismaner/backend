import User from '../entities/User.js';
import { AdminError, guard } from './AdminControlHelpers.js';

export default class AdminViewUserController {
  async viewUser({ userId }) {
    return guard(async () => {
      const user = await User.findById(userId);
      if (!user) throw AdminError.notFound('User not found');
      return user.toAdminJSON();
    });
  }
}
