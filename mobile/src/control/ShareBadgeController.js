import { Share } from 'react-native';

async function shareBadgeController(badge) {
  try {
    const message = `I just earned the "${badge.name}" badge on Run League! 🎖️`;
    await Share.share({ message });
    return { success: true, field: null, message: '' };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default shareBadgeController;
