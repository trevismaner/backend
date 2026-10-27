import PublicEvent from '../entities/PublicEvent.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { guard, withTransaction } from './AdminControlHelpers.js';
import { validatePublicEvent } from './AdminValidators.js';

/**
 * SA-12: As a System Admin, I want to create a new tournament, so that I can run
 * platform-wide tournaments beyond individual groups.
 */
export default class AdminCreatePublicEventController {
  async createEvent({ adminId, input }) {
    const data = validatePublicEvent(input);

    return guard(() =>
      withTransaction(async (client) => {
        const event = await PublicEvent.create(
          {
            createdBy: adminId,
            name: data.name,
            description: data.description ?? null,
            maxParticipants: data.maxParticipants ?? null,
            registrationDeadline: data.registrationDeadline ?? null,
            startDate: data.startDate ?? null,
            endDate: data.endDate ?? null,
          },
          client
        );

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.CREATE_PUBLIC_EVENT,
            targetType: 'public_event',
            targetId: event.eventId,
            details: { name: event.name },
          },
          client
        );

        return event.toJSON();
      })
    );
  }
}
