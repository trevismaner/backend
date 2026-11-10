const React = require('react');
const host = (n) => { const C = ({children,...p}) => React.createElement(n,p,children); C.displayName=n; return C; };
module.exports = new Proxy({
  default: host('Mock'), MapView: host('MapView'), Marker: host('Marker'), Polyline: host('Polyline'),
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 1.3, longitude: 103.8 } }),
  watchPositionAsync: async () => ({ remove: () => {} }),
  Accuracy: { High: 4 },
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }),
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
  setNotificationHandler: () => {},
  StatusBar: host('StatusBar'),
}, { get: (t, k) => (k in t ? t[k] : host(String(k))) });
