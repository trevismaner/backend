import Notification from '../entities/Notification.js';

async function viewNotifications(req, res) {
  try {
    const notifications = await Notification.getForUser(req.user.userId);
    return res.status(200).json({ notifications });
  } catch (err) {
    console.error('View notifications error:', err);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
}

export default viewNotifications;
