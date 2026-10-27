import Tournament from '../entities/Tournament.js';

async function viewTournamentStandings(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const standings = await Tournament.getStandings(req.params.tournamentId);
    return res.status(200).json({ standings });
  } catch (err) {
    console.error('View tournament standings error:', err);
    return res.status(500).json({ error: 'Failed to load standings' });
  }
}

export default viewTournamentStandings;
