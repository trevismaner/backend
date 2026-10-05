import Group from '../entities/Group.js';

async function searchGroups(req, res) {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const groups = await Group.search(q);
    return res.status(200).json({ groups: groups.map((g) => g.toJSON()) });
  } catch (err) {
    console.error('Search groups error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}

export default searchGroups;
