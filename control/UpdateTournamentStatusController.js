import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

const VALID_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

async function updateTournamentStatus(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can update tournament status' });
    }

    const { status } = req.body;
    if (!['open', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (!VALID_TRANSITIONS[tournament.status].includes(status)) {
      return res.status(400).json({ error: `Cannot change status from ${tournament.status} to ${status}` });
    }

    const updated = await Tournament.updateStatus(req.params.tournamentId, status);
    return res.status(200).json({ tournament: updated.toJSON() });
  } catch (err) {
    if (err.status === 400) {
      // Status changed by someone else between the check above and the update.
      return res.status(400).json({ error: err.message });
    }
    console.error('Update tournament status error:', err);
    return res.status(500).json({ error: 'Failed to update tournament status' });
  }
}

export default updateTournamentStatus;
