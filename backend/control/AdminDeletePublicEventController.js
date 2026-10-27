import PublicEvent from '../entities/PublicEvent.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';

/**
 * SA-15: As a System Admin, I want to delete a tournament, so that I can remove one that is
 * no longer needed. Registrations go with it via ON DELETE CASCADE.
 */
export default class AdminDeletePublicEventController {
  async deleteEvent({ adminId, eventId }) {
    return guard(() =>
      withTransaction(async (client) => {
        const event = await PublicEvent.findById(eventId, adminId, client);
        if (!event) throw AdminError.notFound('Public event not found');

        // Recorded first, keeping a snapshot since the row is about to disappear.
        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.DELETE_PUBLIC_EVENT,
            targetType: 'public_event',
            targetId: eventId,
            details: { name: event.name, participants: event.participantCount },
          },
          client
        );

        await PublicEvent.delete(eventId, client);
      })
    );
  }
}
