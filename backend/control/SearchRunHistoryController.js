import Run from '../entities/Run.js';

async function searchRunHistory(req, res) {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    const runs = await Run.searchByUserId(req.user.userId, q);
    return res.status(200).json({ runs: runs.map((r) => r.toSummaryJSON()) });
  } catch (err) {
    console.error('Search run history error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}

export default searchRunHistory;
