import Group from '../entities/Group.js';
import { guard } from './AdminControlHelpers.js';

export default class AdminListGroupsController {
  async listGroups({ search, isSuspended, limit, offset }) {
    return guard(() =>
      Group.findAllForAdmin({ search: search?.trim() || undefined, isSuspended, limit, offset })
    );
  }
}
