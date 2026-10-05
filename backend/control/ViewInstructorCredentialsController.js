import User, { ROLES } from '../entities/User.js';

// IU-04: what this instructor has submitted, and whether it has been reviewed yet.
async function viewInstructorCredentials(req, res) {
  try {
    if (req.user.role !== ROLES.INSTRUCTOR) {
      return res.status(403).json({ error: 'Only instructor accounts have credentials' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json({
      credentials: {
        qualification: user.credentialQualification,
        reference: user.credentialReference,
        submittedAt: user.credentialSubmittedAt,
        status: user.credentialStatus(), // 'not_submitted' | 'pending' | 'verified'
      },
    });
  } catch (err) {
    console.error('View instructor credentials error:', err);
    return res.status(500).json({ error: 'Failed to load credentials' });
  }
}

export default viewInstructorCredentials;
