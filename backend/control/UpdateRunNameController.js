import Run from '../entities/Run.js';
import { parseId } from './RunValidation.js';

const MAX_NAME_LENGTH = 100; // runs.name is VARCHAR(100)

async function updateRunName(req, res) {
  try {
    const runId = parseId(req.params.runId);
    if (!runId) return res.status(400).json({ error: 'Invalid run id' });

    const { name } = req.body;
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    // Without this the oversized value reached the column and failed as a 500.
    if (name.trim().length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name cannot be longer than ${MAX_NAME_LENGTH} characters` });
    }

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (run.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You do not own this run' });
    }

    const updated = await Run.updateName(runId, req.user.userId, name.trim());
    return res.status(200).json({ run: updated.toJSON() });
  } catch (err) {
    console.error('Update run name error:', err);
    return res.status(500).json({ error: 'Failed to update run name' });
  }
}

export default updateRunName;
