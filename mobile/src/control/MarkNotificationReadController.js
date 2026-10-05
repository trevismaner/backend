import Notification from '../entities/Notification.js';

async function markNotificationReadController(notificationId) {
  try {
    const data = await Notification.markRead(notificationId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default markNotificationReadController;
