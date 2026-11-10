import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkPalette, lightPalette } from '../theme/colors.js';

const ThemeContext = createContext(null);
const KEY = 'run_league_theme';

Appearance.setColorScheme('dark');

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');

  useEffect(() => {
    Appearance.setColorScheme('dark');
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        const next = saved === 'light' ? 'light' : 'dark';
        setModeState(next);
        Appearance.setColorScheme(next);
      })
      .catch(() => Appearance.setColorScheme('dark'));
  }, []);

  async function setMode(next) {
    const value = next === 'light' ? 'light' : 'dark';
    setModeState(value);
    Appearance.setColorScheme(value);
    await AsyncStorage.setItem(KEY, value);
  }

  const value = useMemo(() => ({
    mode,
    isDark: mode === 'dark',
    palette: mode === 'dark' ? darkPalette : lightPalette,
    setMode,
    toggle: () => setMode(mode === 'dark' ? 'light' : 'dark'),
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
