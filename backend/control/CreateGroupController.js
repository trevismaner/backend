import Group from '../entities/Group.js';

async function createGroup(req, res) {
  try {
    const { name, description, isPrivate, maxMembers } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const existing = await Group.findByName(name);
    if (existing) {
      return res.status(409).json({ error: 'Group name already in use' });
    }

    const group = await Group.create({ name, description, isPrivate, maxMembers, createdBy: req.user.userId });
    return res.status(201).json({ group: group.toJSON() });
  } catch (err) {
    console.error('Create group error:', err);
    return res.status(500).json({ error: 'Failed to create group' });
  }
}

export default createGroup;
