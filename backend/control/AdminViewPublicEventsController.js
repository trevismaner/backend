import PublicEvent from '../entities/PublicEvent.js';
import { AdminError, guard } from './AdminControlHelpers.js';

/**
 * SA-13: As a System Admin, I want to read the tournaments I manage.
 *
 * Same data a registered user sees (RU-39), reached through the admin section so the
 * admin screens do not have to switch between route trees.
 */
export default class AdminViewPublicEventsController {
  async listEvents({ adminId, limit, offset }) {
    return guard(() => PublicEvent.findAll({ viewerId: adminId, limit, offset }));
  }

  async viewEvent({ adminId, eventId }) {
    return guard(async () => {
      const event = await PublicEvent.findById(eventId, adminId);
      if (!event) throw AdminError.notFound('Public event not found');
      const participants = await PublicEvent.getParticipants(eventId);
      return { event: event.toJSON(), participants };
    });
  }
}
