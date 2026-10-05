import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

async function createTournament(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can create a tournament' });
    }

    const { name, description, distanceType, startDate, endDate } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tournament name is required' });
    }

    const tournament = await Tournament.create({
      groupId: req.params.groupId,
      createdBy: req.user.userId,
      name,
      description,
      distanceType,
      startDate,
      endDate,
    });

    return res.status(201).json({ tournament: tournament.toJSON() });
  } catch (err) {
    console.error('Create tournament error:', err);
    return res.status(500).json({ error: 'Failed to create tournament' });
  }
}

export default createTournament;
