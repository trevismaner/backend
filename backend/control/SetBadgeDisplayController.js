import Badge from '../entities/Badge.js';

async function setBadgeDisplay(req, res) {
  try {
    const { isDisplayed } = req.body;
    if (typeof isDisplayed !== 'boolean') {
      return res.status(400).json({ error: 'isDisplayed must be true or false' });
    }
    const updated = await Badge.setDisplayed(req.user.userId, req.params.badgeId, isDisplayed);
    if (!updated) {
      return res.status(404).json({ error: 'You have not earned this badge' });
    }
    return res.status(200).json({ message: 'Badge display updated' });
  } catch (err) {
    console.error('Set badge display error:', err);
    return res.status(500).json({ error: 'Failed to update badge display' });
  }
}

export default setBadgeDisplay;
