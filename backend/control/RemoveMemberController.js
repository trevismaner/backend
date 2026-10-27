import Group from '../entities/Group.js';

async function removeMember(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can remove members' });
    }

    const { userId } = req.params;
    const membership = await Group.getMembership(req.params.groupId, userId);
    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }

    await Group.removeMember(req.params.groupId, userId);
    return res.status(200).json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove member error:', err);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
}

export default removeMember;
