import Group from '../entities/Group.js';
import User from '../entities/User.js';

async function inviteUserToGroup(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can invite users' });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const invitedUser = await User.findById(userId);
    if (!invitedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const group = await Group.findById(req.params.groupId);
    if (group.maxMembers) {
      const currentCount = await Group.countActiveMembers(req.params.groupId);
      if (currentCount >= group.maxMembers) {
        return res.status(409).json({ error: 'This group has reached its maximum member limit' });
      }
    }

    const existing = await Group.getMembership(req.params.groupId, userId);
    if (existing && existing.status === 'active') {
      return res.status(409).json({ error: 'User is already a member of this group' });
    }

    await Group.addMember(req.params.groupId, userId, 'invited');
    return res.status(200).json({ message: 'Invitation sent' });
  } catch (err) {
    console.error('Invite user to group error:', err);
    return res.status(500).json({ error: 'Failed to invite user' });
  }
}

export default inviteUserToGroup;
