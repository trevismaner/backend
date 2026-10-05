import User from '../entities/User.js';

async function updateProfile(req, res) {
  try {
    const { name, bio, profilePhotoUrl } = req.body;

    if (name !== undefined && name.trim() === '') {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const updatedUser = await User.updateProfile(req.user.userId, { name, bio, profilePhotoUrl });
    return res.status(200).json({ user: updatedUser.toJSON() });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

export default updateProfile;
