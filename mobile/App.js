import { StatusBar } from 'expo-status-bar';

// Imported for its side effect: this registers the background location task by name. The OS
// may deliver a fix in a process where no screen has mounted — after the app was killed
// part way through a run — and it looks the task up by name, so registration has to happen
// at startup rather than when the Log Run screen opens.
import './src/utils/backgroundLocation.js';

import { AuthProvider } from './src/context/AuthContext.js';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext.js';
import AppNavigator from './src/navigation/AppNavigator.js';

function AppContent() {
  const { isDark } = useAppTheme();
  return (
    <AuthProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </AuthProvider>
  );
}

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}
