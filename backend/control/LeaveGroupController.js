import Group from '../entities/Group.js';

async function leaveGroup(req, res) {
  try {
    const membership = await Group.getMembership(req.params.groupId, req.user.userId);
    if (!membership) {
      return res.status(404).json({ error: 'You are not a member of this group' });
    }

    await Group.removeMember(req.params.groupId, req.user.userId);
    return res.status(200).json({ message: 'Left group successfully' });
  } catch (err) {
    console.error('Leave group error:', err);
    return res.status(500).json({ error: 'Failed to leave group' });
  }
}

export default leaveGroup;
