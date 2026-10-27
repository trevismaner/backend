import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

async function deleteTournament(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can delete this tournament' });
    }

    await Tournament.delete(req.params.tournamentId);
    return res.status(200).json({ message: 'Tournament deleted' });
  } catch (err) {
    console.error('Delete tournament error:', err);
    return res.status(500).json({ error: 'Failed to delete tournament' });
  }
}

export default deleteTournament;
