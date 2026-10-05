import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

async function viewTournamentDetails(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const [participantCount, isGroupAdmin, participation] = await Promise.all([
      Tournament.countParticipants(tournament.tournamentId),
      Group.isAdmin(tournament.groupId, req.user.userId),
      Tournament.getParticipation(tournament.tournamentId, req.user.userId),
    ]);

    return res.status(200).json({
      tournament: tournament.toJSON(),
      participantCount,
      // Lets the screen show the right actions without a second round trip.
      isGroupAdmin,
      isParticipant: !!participation && !participation.withdrawn,
    });
  } catch (err) {
    console.error('View tournament details error:', err);
    return res.status(500).json({ error: 'Failed to load tournament details' });
  }
}

export default viewTournamentDetails;
