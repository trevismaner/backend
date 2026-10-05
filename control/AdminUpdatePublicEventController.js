import PublicEvent from '../entities/PublicEvent.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validatePublicEvent } from './AdminValidators.js';

/**
 * SA-14: As a System Admin, I want to update tournaments, so that I can adjust rules or
 * scheduling for a public event.
 */
export default class AdminUpdatePublicEventController {
  async updateEvent({ adminId, eventId, input }) {
    const changes = validatePublicEvent(input, { partial: true });

    return guard(() =>
      withTransaction(async (client) => {
        if (!(await PublicEvent.exists(eventId, client))) {
          throw AdminError.notFound('Public event not found');
        }

        const event = await PublicEvent.update(eventId, changes, client);

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.UPDATE_PUBLIC_EVENT,
            targetType: 'public_event',
            targetId: event.eventId,
            details: { name: event.name, fields: Object.keys(changes) },
          },
          client
        );

        return event.toJSON();
      })
    );
  }
}
