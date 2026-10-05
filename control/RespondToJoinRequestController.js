import Group from '../entities/Group.js';

async function respondToJoinRequest(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can respond to join requests' });
    }

    const { userId, decision } = req.body;
    if (!userId || !['accept', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'userId and a valid decision (accept/reject) are required' });
    }

    const membership = await Group.getMembership(req.params.groupId, userId);
    if (!membership || membership.status !== 'pending') {
      return res.status(404).json({ error: 'No pending request found for this user' });
    }

    if (decision === 'accept') {
      const group = await Group.findById(req.params.groupId);
      if (group.maxMembers) {
        const currentCount = await Group.countActiveMembers(req.params.groupId);
        if (currentCount >= group.maxMembers) {
          return res.status(409).json({ error: 'This group has reached its maximum member limit' });
        }
      }
      await Group.setMemberStatus(req.params.groupId, userId, 'active');
    } else {
      await Group.removeMember(req.params.groupId, userId);
    }

    return res.status(200).json({ message: `Request ${decision}ed` });
  } catch (err) {
    console.error('Respond to join request error:', err);
    return res.status(500).json({ error: 'Failed to respond to join request' });
  }
}

export default respondToJoinRequest;
