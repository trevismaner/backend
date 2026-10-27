import Tournament from '../entities/Tournament.js';

async function viewGroupTournaments(req, res) {
  try {
    const tournaments = await Tournament.getByGroupId(req.params.groupId);
    return res.status(200).json({ tournaments: tournaments.map((t) => t.toJSON()) });
  } catch (err) {
    console.error('View group tournaments error:', err);
    return res.status(500).json({ error: 'Failed to load tournaments' });
  }
}

export default viewGroupTournaments;
