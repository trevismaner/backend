import Notification from '../entities/Notification.js';

async function updateNotificationPreferencesController(prefs) {
  try {
    const data = await Notification.updatePreferences(prefs);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateNotificationPreferencesController;
