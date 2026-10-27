import Run from '../entities/Run.js';
import { parsePaging } from './RunValidation.js';

async function viewRunHistory(req, res) {
  try {
    // Checked here rather than passed straight through: PostgreSQL errors on a negative
    // LIMIT, which used to surface as a 500.
    const paging = parsePaging(req.query);
    if (paging.error) return res.status(400).json({ error: paging.error });

    const runs = await Run.findByUserId(req.user.userId, paging.value);
    return res.status(200).json({ runs: runs.map((r) => r.toSummaryJSON()) });
  } catch (err) {
    console.error('View run history error:', err);
    return res.status(500).json({ error: 'Failed to load run history' });
  }
}

export default viewRunHistory;
