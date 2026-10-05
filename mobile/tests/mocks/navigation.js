const React = require('react');

// Focus callbacks registered by mounted screens. A screen's useFocusEffect runs on mount and
// again every time the screen is focused; react-test-renderer has no notion of focus, so the
// harness re-fires them by hand with __fireFocus() to check that coming back to a tab really
// does reload its data.
const pendingFocus = [];

module.exports = {
  useFocusEffect: (cb) => {
    React.useEffect(() => {
      pendingFocus.push(cb);
      const cleanup = cb();
      return () => {
        const at = pendingFocus.indexOf(cb);
        if (at >= 0) pendingFocus.splice(at, 1);
        if (typeof cleanup === 'function') cleanup();
      };
    }, [cb]);
  },
  useNavigation: () => global.__nav,
  useIsFocused: () => true,
  NavigationContainer: ({ children }) => React.createElement('NavigationContainer', null, children),
  DarkTheme: { colors: {} },

  __pendingFocus: pendingFocus,
  /** Re-runs every mounted screen's focus effect, as navigating back to it would. */
  __fireFocus: () => pendingFocus.slice().forEach((cb) => cb()),
};
