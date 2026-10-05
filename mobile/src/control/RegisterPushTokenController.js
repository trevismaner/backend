import Notification from '../entities/Notification.js';

async function registerPushTokenController(pushToken) {
  if (!pushToken) {
    return { success: false, field: null, message: 'No push token available.' };
  }
  try {
    const data = await Notification.registerPushToken(pushToken);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default registerPushTokenController;
