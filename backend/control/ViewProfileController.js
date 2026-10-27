import Run from '../entities/Run.js';

/**
 * The signed-in user's own profile (RU-03), with the running totals the profile screen shows.
 *
 * The totals are computed here rather than added up in the app. The screen used to fetch the
 * entire run history and sum it client-side, which sent a whole history over the network to
 * produce two numbers — and stopped working altogether once that history no longer fitted in
 * a single page of results.
 */
async function viewProfile(req, res) {
  try {
    const stats = await Run.getTotalsForUser(req.user.userId);
    return res.status(200).json({ user: req.user.toJSON(), stats });
  } catch (err) {
    console.error('View profile error:', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
}

export default viewProfile;
