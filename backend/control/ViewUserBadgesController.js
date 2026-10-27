import Badge from '../entities/Badge.js';

async function viewUserBadges(req, res) {
  try {
    const badges = await Badge.getForUser(req.user.userId);
    return res.status(200).json({ badges });
  } catch (err) {
    console.error('View user badges error:', err);
    return res.status(500).json({ error: 'Failed to load badges' });
  }
}

export default viewUserBadges;
