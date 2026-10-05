import { Share } from 'react-native';

async function shareRunController(run) {
  try {
    const message = `I just ran ${run.distanceKm}km on Run League! 🏃`;
    await Share.share({ message });
    return { success: true, field: null, message: '' };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default shareRunController;
