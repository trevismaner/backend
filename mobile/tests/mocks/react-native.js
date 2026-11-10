// Minimal stand-in for react-native so screens can be mounted in Node.
// Every primitive becomes a plain host component, so react-test-renderer can render it
// and we find out whether a screen's own code crashes.
const React = require('react');

const host = (name) => {
  const C = ({ children, ...props }) => React.createElement(name, props, children);
  C.displayName = name;
  return C;
};

const View = host('View');
const Text = host('Text');
const ScrollView = host('ScrollView');
const Pressable = host('Pressable');
const TouchableOpacity = host('TouchableOpacity');
const TextInput = host('TextInput');
const Switch = host('Switch');
const Modal = host('Modal');
const ActivityIndicator = host('ActivityIndicator');
const SafeAreaView = host('SafeAreaView');
const Image = host('Image');
const RefreshControl = host('RefreshControl');

// FlatList/SectionList render their data, which is what we want to exercise:
// a bad renderItem or keyExtractor should blow up here just like on a device.
function FlatList({ data = [], renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...rest }) {
  const header = ListHeaderComponent
    ? (typeof ListHeaderComponent === 'function' ? React.createElement(ListHeaderComponent) : ListHeaderComponent)
    : null;
  const footer = ListFooterComponent
    ? (typeof ListFooterComponent === 'function' ? React.createElement(ListFooterComponent) : ListFooterComponent)
    : null;
  const empty = (!data || data.length === 0) && ListEmptyComponent
    ? (typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent)
    : null;
  const items = (data || []).map((item, index) => {
    const el = renderItem ? renderItem({ item, index }) : null;
    const key = keyExtractor ? keyExtractor(item, index) : String(index);
    return React.createElement(React.Fragment, { key }, el);
  });
  return React.createElement('FlatList', rest, header, ...items, empty, footer);
}

const StyleSheet = {
  create: (styles) => styles,
  flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  absoluteFill: {},
  hairlineWidth: 1,
};

const alerts = [];
const Alert = {
  alert: (title, message, buttons) => { alerts.push({ title, message, buttons }); },
  _drain: () => alerts.splice(0, alerts.length),
};

// LogRunScreen listens for the app returning to the foreground, to fold in the GPS fixes the
// background task recorded while it was away. `_fire` lets a test simulate that.
const appStateHandlers = [];
const AppState = {
  currentState: 'active',
  addEventListener: (_event, handler) => {
    appStateHandlers.push(handler);
    return {
      remove: () => {
        const at = appStateHandlers.indexOf(handler);
        if (at >= 0) appStateHandlers.splice(at, 1);
      },
    };
  },
  _fire: (next = 'active') => appStateHandlers.slice().map((h) => h(next)),
};

module.exports = {
  View, Text, ScrollView, Pressable, TouchableOpacity, TouchableHighlight: TouchableOpacity,
  TextInput, Switch, Modal, ActivityIndicator, SafeAreaView, Image, RefreshControl,
  FlatList, SectionList: FlatList,
  StyleSheet, Alert,
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
  // Real react-native exports these; colors.js reads them at module load.
  Appearance: { getColorScheme: () => 'dark', setColorScheme: () => {}, addChangeListener: () => ({ remove: () => {} }) },
  DynamicColorIOS: ({ light, dark }) => dark ?? light,
  PlatformColor: (token) => token,
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  AppState,
  KeyboardAvoidingView: View,
  Share: { share: async () => ({ action: 'sharedAction' }) },
  Linking: { openURL: async () => {} },
  Animated: { View, Text, timing: () => ({ start: () => {} }), Value: function () { this.setValue = () => {}; } },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
};
