import AsyncStorage from '@react-native-async-storage/async-storage';
import User from '../entities/User.js';

async function restoreSessionController() {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    return { success: false, field: null, message: 'No session found.' };
  }
  try {
    const data = await User.getCurrent();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    await AsyncStorage.removeItem('token');
    return { success: false, field: null, message: err.message };
  }
}

export default restoreSessionController;
