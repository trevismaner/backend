import Notification from '../entities/Notification.js';

async function updateNotificationPreferences(req, res) {
  try {
    const preferences = await Notification.updatePreferences(req.user.userId, req.body);
    return res.status(200).json({ preferences });
  } catch (err) {
    console.error('Update notification preferences error:', err);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
}

export default updateNotificationPreferences;
