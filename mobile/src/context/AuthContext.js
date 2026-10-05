import { createContext, useContext, useState, useEffect } from 'react';
import loginController from '../control/LoginController.js';
import registerController from '../control/RegisterController.js';
import logoutController from '../control/LogoutController.js';
import restoreSessionController from '../control/RestoreSessionController.js';
import { registerForPushNotifications } from '../utils/pushNotifications.js';
import { setUnauthorisedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession();
    setUnauthorisedHandler(() => setUser(null));
    return () => setUnauthorisedHandler(null);
  }, []);

  async function restoreSession() {
    const result = await restoreSessionController();
    if (result.success) {
      setUser(result.data.user);
      registerForPushNotifications();
    }
    setIsLoading(false);
  }

  async function signIn({ email, password }) {
    const result = await loginController({ email, password });
    if (!result.success) {
      throw new Error(result.message);
    }
    setUser(result.data.user);
    registerForPushNotifications();
  }

  async function register({ email, password, name, accountType }) {
    const result = await registerController({ email, password, name, accountType });
    if (!result.success) {
      throw new Error(result.message);
    }
    setUser(result.data.user);
    registerForPushNotifications();
  }

  async function signOut() {
    await logoutController();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, register, signOut, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
