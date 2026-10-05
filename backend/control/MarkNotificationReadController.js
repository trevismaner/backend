import Notification from '../entities/Notification.js';

async function markNotificationRead(req, res) {
  try {
    const notification = await Notification.markRead(req.params.notificationId, req.user.userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.status(200).json({ notification });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
}

export default markNotificationRead;
