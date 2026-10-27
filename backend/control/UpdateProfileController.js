import User from '../entities/User.js';
import {
  validateText,
  MAX_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_URL_LENGTH,
} from './InputPolicy.js';

/**
 * Each field is optional — `undefined` means "leave it alone", which is what the entity's
 * COALESCE already does — but a field that IS present has to be valid.
 *
 * Before this, the only check was that a name was not blank. A 101-character name therefore
 * reached Postgres, where `users.name` is VARCHAR(100), and the driver's length error fell
 * into the catch below as `500 Failed to update profile`. That told the person their change
 * had broken the server rather than that their name was two characters too long, and the
 * response carried no hint of the real limit, so the screen could not tell them either.
 * `{ name: 123 }` had the same ending by a different route: `name.trim` is not a function.
 */
async function updateProfile(req, res) {
  try {
    const { name, bio, profilePhotoUrl } = req.body;

    const checks = [
      validateText(name, { label: 'Name', max: MAX_NAME_LENGTH, required: false }),
      validateText(bio, { label: 'Bio', max: MAX_BIO_LENGTH, required: false }),
      validateText(profilePhotoUrl, {
        label: 'Profile photo URL',
        max: MAX_URL_LENGTH,
        required: false,
      }),
    ];

    const bad = checks.find((check) => !check.ok);
    if (bad) {
      return res.status(400).json({ error: bad.problem });
    }

    const [checkedName, checkedBio, checkedPhotoUrl] = checks;

    // The trimmed values, so what is stored matches what was validated.
    const updatedUser = await User.updateProfile(req.user.userId, {
      name: checkedName.value,
      bio: checkedBio.value,
      profilePhotoUrl: checkedPhotoUrl.value,
    });
    return res.status(200).json({ user: updatedUser.toJSON() });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

export default updateProfile;
