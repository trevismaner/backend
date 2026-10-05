import Run from '../entities/Run.js';
import { guard } from './AdminControlHelpers.js';

export default class AdminListRunsController {
  // maxPaceSecondsPerKm=150 finds runs faster than 2:30/km (likely not on foot).
  async listRuns({ userId, minDistanceKm, maxPaceSecondsPerKm, limit, offset }) {
    return guard(() => Run.findAllForAdmin({ userId, minDistanceKm, maxPaceSecondsPerKm, limit, offset }));
  }
}
