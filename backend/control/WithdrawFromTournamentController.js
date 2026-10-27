import Tournament from '../entities/Tournament.js';

async function withdrawFromTournament(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'open') {
      return res.status(409).json({ error: 'Cannot withdraw after the tournament has started' });
    }

    const participation = await Tournament.getParticipation(tournament.tournamentId, req.user.userId);
    if (!participation || participation.withdrawn) {
      return res.status(404).json({ error: 'You are not registered for this tournament' });
    }

    await Tournament.withdrawParticipant(tournament.tournamentId, req.user.userId);
    return res.status(200).json({ message: 'Withdrawn from tournament' });
  } catch (err) {
    console.error('Withdraw from tournament error:', err);
    return res.status(500).json({ error: 'Failed to withdraw from tournament' });
  }
}

export default withdrawFromTournament;
