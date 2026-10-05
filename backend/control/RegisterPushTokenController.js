import User from '../entities/User.js';

async function registerPushToken(req, res) {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ error: 'pushToken is required' });
    }
    await User.setPushToken(req.user.userId, pushToken);
    return res.status(200).json({ message: 'Push token registered' });
  } catch (err) {
    console.error('Register push token error:', err);
    return res.status(500).json({ error: 'Failed to register push token' });
  }
}

export default registerPushToken;
