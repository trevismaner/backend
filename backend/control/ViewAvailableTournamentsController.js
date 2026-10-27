import Tournament from '../entities/Tournament.js';

async function viewAvailableTournaments(req, res) {
  try {
    const tournaments = await Tournament.getAvailableForUser(req.user.userId);
    return res.status(200).json({ tournaments });
  } catch (err) {
    console.error('View available tournaments error:', err);
    return res.status(500).json({ error: 'Failed to load available tournaments' });
  }
}

export default viewAvailableTournaments;
