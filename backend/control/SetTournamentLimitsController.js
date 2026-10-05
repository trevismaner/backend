import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

async function setTournamentLimits(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can set tournament limits' });
    }

    const { maxParticipants, registrationDeadline } = req.body;

    if (maxParticipants !== undefined) {
      const currentCount = await Tournament.countParticipants(tournament.tournamentId);
      if (maxParticipants < currentCount) {
        return res.status(400).json({ error: 'Participant limit cannot be below the current registered count' });
      }
    }

    if (registrationDeadline && new Date(registrationDeadline) < new Date()) {
      return res.status(400).json({ error: 'Registration deadline cannot be in the past' });
    }

    const updated = await Tournament.setLimits(req.params.tournamentId, { maxParticipants, registrationDeadline });
    return res.status(200).json({ tournament: updated.toJSON() });
  } catch (err) {
    console.error('Set tournament limits error:', err);
    return res.status(500).json({ error: 'Failed to update tournament limits' });
  }
}

export default setTournamentLimits;
