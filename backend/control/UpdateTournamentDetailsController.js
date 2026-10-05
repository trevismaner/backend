import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

async function updateTournamentDetails(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can update this tournament' });
    }

    const { name, description, distanceType, startDate, endDate } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Tournament name cannot be empty' });
    }

    const updated = await Tournament.update(req.params.tournamentId, {
      name,
      description,
      distanceType,
      startDate,
      endDate,
    });
    return res.status(200).json({ tournament: updated.toJSON() });
  } catch (err) {
    console.error('Update tournament details error:', err);
    return res.status(500).json({ error: 'Failed to update tournament' });
  }
}

export default updateTournamentDetails;
