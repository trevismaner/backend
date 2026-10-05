import User from '../entities/User.js';
import Group from '../entities/Group.js';
import Run from '../entities/Run.js';
import Tournament from '../entities/Tournament.js';
import Reward from '../entities/Reward.js';
import { guard } from './AdminControlHelpers.js';

export default class AdminViewStatsController {
  async viewStats() {
    return guard(async () => {
      const [users, groups, runs, tournaments, rewards] = await Promise.all([
        User.getStats(),
        Group.getStats(),
        Run.getStats(),
        Tournament.getStats(),
        Reward.getStats(),
      ]);
      return { users, groups, runs, tournaments, rewards };
    });
  }
}
