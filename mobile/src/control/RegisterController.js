   import AsyncStorage from '@react-native-async-storage/async-storage';
   import User from '../entities/User.js';

   async function registerController({ name, email, password, accountType }) {
     if (!name || !name.trim()) {
       return { success: false, field: 'name', message: 'Name is required.' };
     }
     if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
       return { success: false, field: 'email', message: 'A valid email is required.' };
     }
     if (!password || password.length < 6) {
       return { success: false, field: 'password', message: 'Password must be at least 6 characters.' };
     }

     try {
       const data = await User.register({ name, email, password, accountType });
       await AsyncStorage.setItem('token', data.token);
       return { success: true, field: null, message: '', data };
     } catch (err) {
       return { success: false, field: null, message: err.message };
     }
   }

   export default registerController;