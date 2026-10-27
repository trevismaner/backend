import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { guard, withTransaction } from './AdminControlHelpers.js';
import { validateAnnouncement } from './AdminValidators.js';

export default class AdminSendAnnouncementController {
  // Creates an in-app notification for every non-suspended user (or only one role).
  // Returns the number of recipients.
  async sendAnnouncement({ adminId, input }) {
    const { title, body, role } = validateAnnouncement(input);

    return guard(() =>
      withTransaction(async (client) => {
        const recipients = await Notification.broadcast({ type: 'announcement', title, body, role }, client);
        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.SEND_ANNOUNCEMENT,
            targetType: 'announcement',
            details: { title, role, recipients },
          },
          client
        );
        return recipients;
      })
    );
  }
}
