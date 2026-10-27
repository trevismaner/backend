import Reward from '../entities/Reward.js';
import { guard } from './AdminControlHelpers.js';

// Includes inactive and out-of-stock rewards.
export default class AdminListRewardsController {
  async listRewards() {
    return guard(() => Reward.getAllForAdmin());
  }
}
