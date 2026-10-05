import { Appearance, DynamicColorIOS, Platform } from 'react-native';

/**
 * Picks the light or dark value for a colour.
 *
 * Android deliberately does NOT use PlatformColor('?android:attr/...'). Those tokens resolve
 * against the HOST app's Android theme — which, inside Expo Go, is Expo Go's theme, not ours.
 * The result was `background` and `ink` both resolving to white, so every piece of body text
 * was invisible. Only the hard-coded hex colours (primary, onPrimary) still showed.
 *
 * Reading the device scheme instead keeps light and dark consistent with each other, so the
 * text always contrasts with the background it sits on.
 *
 * The third argument (the old Android token) is ignored. It is still accepted so the colour
 * definitions below did not have to change.
 */
// Optional-chained: Appearance is absent in some runtimes (and in test mocks), and this
// runs at module load, so a hard call here would take the whole app down.
const scheme = Appearance?.getColorScheme?.() === 'light' ? 'light' : 'dark';

const adaptive = (light, dark) => {
  if (Platform.OS === 'ios') return DynamicColorIOS({ light, dark });
  return scheme === 'light' ? light : dark;
};

export const colors = {
  background: adaptive('#FFFFFF', '#000000', '?android:attr/colorBackground'),
  adminBackground: adaptive('#F6F7F8', '#0B1118', '?android:attr/colorBackground'),
  surface: adaptive('#F3F5F6', '#0F1822', '?android:attr/colorBackgroundFloating'),
  surfaceRaised: adaptive('#EEF1F3', '#151F28', '?android:attr/colorBackgroundFloating'),
  surfaceMuted: adaptive('#FFFFFF', '#0D151E', '?android:attr/colorBackground'),
  cardEnd: adaptive('#EEF1F3', '#17212A', '?android:attr/colorBackgroundFloating'),
  cardStart: adaptive('#F6F7F8', '#101923', '?android:attr/colorBackgroundFloating'),
  ink: adaptive('#000000', '#FFFFFF', '?android:attr/textColorPrimary'),
  inkMuted: adaptive('#52606B', '#A2A9AD', '?android:attr/textColorSecondary'),
  inkFaint: adaptive('#75818B', '#707A83', '?android:attr/textColorSecondary'),
  border: adaptive('#D8DDE1', '#26313B', '?android:attr/colorControlNormal'),
  borderStrong: adaptive('#C7CED4', '#36444F', '?android:attr/colorControlNormal'),
  primary: '#CE0E2D',
  primaryPressed: '#AA0B25',
  onPrimary: '#FFFFFF',
  success: '#5BCB8A',
  warning: '#FFB020',
  riskLow: '#36A269',
  riskModerate: '#D98900',
  riskHigh: '#E33A31',
  riskLowBg: adaptive('#EAF7EF', '#102619', '?android:attr/colorBackgroundFloating'),
  riskModerateBg: adaptive('#FFF5DF', '#2B2110', '?android:attr/colorBackgroundFloating'),
  riskHighBg: adaptive('#FDECEC', '#2B1212', '?android:attr/colorBackgroundFloating'),
  white75: adaptive('rgba(50,62,72,0.65)', 'rgba(255,255,255,0.75)'),
  overlay: 'rgba(0,0,0,0.72)',
};

export const lightPalette = {
  background: '#FFFFFF', surface: '#F3F5F6', surfaceRaised: '#EEF1F3', surfaceMuted: '#FFFFFF',
  ink: '#000000', inkMuted: '#52606B', inkFaint: '#75818B', border: '#D8DDE1', borderStrong: '#C7CED4', primary: '#CE0E2D'
};

export const darkPalette = {
  background: '#000000', surface: '#0F1822', surfaceRaised: '#151F28', surfaceMuted: '#0D151E',
  ink: '#FFFFFF', inkMuted: '#A2A9AD', inkFaint: '#707A83', border: '#26313B', borderStrong: '#36444F', primary: '#CE0E2D'
};
