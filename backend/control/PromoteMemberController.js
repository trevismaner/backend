import Group from '../entities/Group.js';

async function promoteMember(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can promote members' });
    }

    const { userId } = req.params;
    const membership = await Group.getMembership(req.params.groupId, userId);
    if (!membership || membership.status !== 'active') {
      return res.status(404).json({ error: 'User is not an active member of this group' });
    }

    await Group.promoteMember(req.params.groupId, userId);
    return res.status(200).json({ message: 'Member promoted to group admin' });
  } catch (err) {
    console.error('Promote member error:', err);
    return res.status(500).json({ error: 'Failed to promote member' });
  }
}

export default promoteMember;
