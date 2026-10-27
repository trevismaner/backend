import Group from '../entities/Group.js';

async function viewGroupDetails(req, res) {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const members = await Group.getMembers(group.groupId);
    const memberCount = members.filter((m) => m.status === 'active').length;

    return res.status(200).json({ group: group.toJSON(), members, memberCount });
  } catch (err) {
    console.error('View group details error:', err);
    return res.status(500).json({ error: 'Failed to load group details' });
  }
}

export default viewGroupDetails;
