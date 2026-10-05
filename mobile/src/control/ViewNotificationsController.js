import Notification from '../entities/Notification.js';

async function viewNotificationsController() {
  try {
    const data = await Notification.getAll();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewNotificationsController;
