import Group from '../entities/Group.js';

async function viewMyGroups(req, res) {
  try {
    const groups = await Group.getGroupsForUser(req.user.userId);
    return res.status(200).json({ groups: groups.map((group) => group.toJSON()) });
  } catch (err) {
    console.error('View my groups error:', err);
    return res.status(500).json({ error: 'Failed to load your groups' });
  }
}

export default viewMyGroups;
