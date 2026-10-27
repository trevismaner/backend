import User, { ROLES } from '../entities/User.js';

/**
 * IU-04 / SA-11: an instructor submits their credentials so a System Admin has something
 * concrete to verify. Resubmitting replaces the previous details and sends the account back
 * to "pending", because what was verified has changed.
 */
async function submitInstructorCredentials(req, res) {
  try {
    if (req.user.role !== ROLES.INSTRUCTOR) {
      return res.status(403).json({ error: 'Only instructor accounts submit credentials' });
    }

    const { qualification, reference } = req.body ?? {};

    if (typeof qualification !== 'string' || !qualification.trim()) {
      return res.status(400).json({ error: 'Qualification is required' });
    }
    if (qualification.trim().length > 200) {
      return res.status(400).json({ error: 'Qualification must be 200 characters or fewer' });
    }
    if (reference !== undefined && reference !== null && typeof reference !== 'string') {
      return res.status(400).json({ error: 'Credential reference must be text' });
    }
    if (typeof reference === 'string' && reference.trim().length > 200) {
      return res.status(400).json({ error: 'Credential reference must be 200 characters or fewer' });
    }

    const user = await User.saveCredentials(req.user.userId, {
      qualification: qualification.trim(),
      reference: typeof reference === 'string' ? reference.trim() || null : null,
    });

    return res.status(200).json({
      message: 'Credentials submitted for review',
      credentials: {
        qualification: user.credentialQualification,
        reference: user.credentialReference,
        submittedAt: user.credentialSubmittedAt,
        status: user.credentialStatus(),
      },
    });
  } catch (err) {
    console.error('Submit instructor credentials error:', err);
    return res.status(500).json({ error: 'Failed to submit credentials' });
  }
}

export default submitInstructorCredentials;
