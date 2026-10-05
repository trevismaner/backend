import Badge from '../entities/Badge.js';
import { guard } from './AdminControlHelpers.js';
import { toBadgeJSON } from './AdminBadgeRules.js';

export default class AdminListBadgesController {
  async listBadges() {
    return guard(async () => (await Badge.getAllWithCounts()).map(toBadgeJSON));
  }
}
