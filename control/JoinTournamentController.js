import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

// Tournament.joinWithCapacity() does the open/deadline/capacity checks inside a lock,
// so two people can't both take the last place.
const JOIN_ERRORS = {
  not_found: [404, 'Tournament not found'],
  group_suspended: [403, 'This tournament belongs to a suspended group'],
  not_open: [409, 'Registration is not open for this tournament'],
  deadline_passed: [409, 'The registration deadline has passed'],
  already_joined: [409, 'You are already registered for this tournament'],
  full: [409, 'This tournament has reached its maximum participant limit'],
};

async function joinTournament(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const membership = await Group.getMembership(tournament.groupId, req.user.userId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'You must be a member of this group to join its tournament' });
    }

    const result = await Tournament.joinWithCapacity(tournament.tournamentId, req.user.userId);
    if (!result.ok) {
      const [status, error] = JOIN_ERRORS[result.reason];
      return res.status(status).json({ error });
    }

    return res.status(200).json({ message: 'Registered for tournament' });
  } catch (err) {
    console.error('Join tournament error:', err);
    return res.status(500).json({ error: 'Failed to join tournament' });
  }
}

export default joinTournament;
