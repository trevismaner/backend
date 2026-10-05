import AsyncStorage from '@react-native-async-storage/async-storage';
import User from '../entities/User.js';

async function loginController({ email, password }) {
  if (!email || !password) {
    return { success: false, field: null, message: 'Email and password are required.' };
  }

  try {
    const data = await User.login({ email, password });
    await AsyncStorage.setItem('token', data.token);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default loginController;
