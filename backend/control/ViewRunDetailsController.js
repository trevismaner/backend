import Run from '../entities/Run.js';
import { parseId } from './RunValidation.js';

async function viewRunDetails(req, res) {
  try {
    // An id like "active" reached PostgreSQL as an integer parameter and errored there,
    // which came back as a 500.
    const runId = parseId(req.params.runId);
    if (!runId) return res.status(400).json({ error: 'Invalid run id' });

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (run.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You do not own this run' });
    }
    return res.status(200).json({ run: run.toJSON() });
  } catch (err) {
    console.error('View run details error:', err);
    return res.status(500).json({ error: 'Failed to load run details' });
  }
}

export default viewRunDetails;
