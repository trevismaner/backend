import Group from '../entities/Group.js';

// Group.addMemberWithCapacity() checks suspension and capacity inside a lock,
// so the member limit holds even when several people join at once.
const JOIN_ERRORS = {
  not_found: [404, 'Group not found'],
  suspended: [403, 'This group has been suspended'],
  full: [409, 'This group has reached its maximum member limit'],
};

async function joinGroup(req, res) {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const existing = await Group.getMembership(req.params.groupId, req.user.userId);
    if (existing && existing.status === 'active') {
      return res.status(409).json({ error: 'You are already a member of this group' });
    }

    const status = group.isPrivate ? 'pending' : 'active';
    const result = await Group.addMemberWithCapacity(group.groupId, req.user.userId, status);
    if (!result.ok) {
      const [code, error] = JOIN_ERRORS[result.reason];
      return res.status(code).json({ error });
    }

    return res.status(200).json({
      message: status === 'pending' ? 'Join request sent' : 'Joined group successfully',
      status,
    });
  } catch (err) {
    console.error('Join group error:', err);
    return res.status(500).json({ error: 'Failed to join group' });
  }
}

export default joinGroup;
