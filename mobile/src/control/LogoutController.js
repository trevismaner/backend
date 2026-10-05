import AsyncStorage from '@react-native-async-storage/async-storage';
import User from '../entities/User.js';

async function logoutController() {
  try {
    await User.logout();
  } catch (err) {}
  await AsyncStorage.removeItem('token');
  return { success: true, field: null, message: '' };
}

export default logoutController;
