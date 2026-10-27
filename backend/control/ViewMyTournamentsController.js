import Tournament from '../entities/Tournament.js';

async function viewMyTournaments(req, res) {
  try {
    const joined = await Tournament.getJoinedForUser(req.user.userId);
    const created = await Tournament.getCreatedForUser(req.user.userId);
    return res.status(200).json({ joined, created });
  } catch (err) {
    console.error('View my tournaments error:', err);
    return res.status(500).json({ error: 'Failed to load your tournaments' });
  }
}

export default viewMyTournaments;
