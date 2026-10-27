import Group from '../entities/Group.js';

async function updateGroupDetails(req, res) {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can update this group' });
    }

    const { name, description, maxMembers } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Group name cannot be empty' });
    }

    const updated = await Group.update(req.params.groupId, { name, description, maxMembers });
    return res.status(200).json({ group: updated.toJSON() });
  } catch (err) {
    console.error('Update group details error:', err);
    return res.status(500).json({ error: 'Failed to update group' });
  }
}

export default updateGroupDetails;
