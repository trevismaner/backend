import Notification from '../entities/Notification.js';

async function viewNotificationPreferencesController() {
  try {
    const data = await Notification.getPreferences();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewNotificationPreferencesController;
