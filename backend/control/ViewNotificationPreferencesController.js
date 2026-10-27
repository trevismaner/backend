import Notification from '../entities/Notification.js';

async function viewNotificationPreferences(req, res) {
  try {
    const preferences = await Notification.getPreferences(req.user.userId);
    return res.status(200).json({ preferences });
  } catch (err) {
    console.error('View notification preferences error:', err);
    return res.status(500).json({ error: 'Failed to load preferences' });
  }
}

export default viewNotificationPreferences;
