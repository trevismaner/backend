import Run from '../entities/Run.js';
import { parseId } from './RunValidation.js';

async function updateRunDescription(req, res) {
  try {
    const runId = parseId(req.params.runId);
    if (!runId) return res.status(400).json({ error: 'Invalid run id' });

    const { description } = req.body;
    if (description !== null && description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'Description must be text' });
    }
    if (description && description.length > 1000) {
      return res.status(400).json({ error: 'Description exceeds character limit' });
    }

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (run.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You do not own this run' });
    }

    const updated = await Run.updateDescription(runId, req.user.userId, description);
    return res.status(200).json({ run: updated.toJSON() });
  } catch (err) {
    console.error('Update run description error:', err);
    return res.status(500).json({ error: 'Failed to update run description' });
  }
}

export default updateRunDescription;
