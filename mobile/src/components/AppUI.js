import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

export function Screen({ children, style }) {
  return <SafeAreaView edges={['top','left','right']} style={[styles.screen, style]}>{children}</SafeAreaView>;
}

export function Brand({ large = false, compact = false }) {
  return (
    <View style={styles.brandWrap}>
      <View style={styles.brandLetters}>
        <Text style={[styles.brandR, large && styles.brandLarge, compact && styles.brandCompact]}>R</Text>
        <Text style={[styles.brandL, large && styles.brandLarge, compact && styles.brandCompact]}>L</Text>
      </View>
      {!compact && <Text style={styles.brandCaption}>RUN LEAGUE</Text>}
    </View>
  );
}

export function Header({ title, navigation, back = true, right, leftAligned = false }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation?.goBack()} hitSlop={14} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : leftAligned ? null : <View style={styles.backSpacer} />}
      <Text numberOfLines={1} style={[styles.headerTitle, leftAligned && styles.headerTitleLeft]}>{title}</Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function FeatureCard({ title, subtitle, onPress }) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, multiline = false, secureTextEntry = false, keyboardType, autoCapitalize, editable = true }) {
  return (
    <View style={[styles.field, multiline && styles.fieldMultiline, !editable && styles.fieldDisabled]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        selectionColor={colors.primary}
      />
    </View>
  );
}

export function Button({ children, onPress, variant = 'primary', disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{children}</Text>
    </Pressable>
  );
}

export function Chip({ children, active = false, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  );
}

export function StatCard({ value, label, style }) {
  return (
    <Card style={[styles.statCard, style]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function ListCard({ title, subtitle, onPress, leading, trailing, style }) {
  return (
    <Pressable style={({ pressed }) => [styles.listCard, style, pressed && styles.pressed]} onPress={onPress}>
      {leading !== false && <View style={styles.listLeading}>{leading ?? <View style={styles.listDot} />}</View>}
      <View style={styles.listCopy}>
        <Text numberOfLines={1} style={styles.listTitle}>{title}</Text>
        {!!subtitle && <Text numberOfLines={2} style={styles.listSubtitle}>{subtitle}</Text>}
      </View>
      {trailing ?? <Text style={styles.listChevron}>›</Text>}
    </Pressable>
  );
}

function NavIcon({ type, color }) {
  if (type === 'home') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.homeRoof, { borderColor: color }]} />
        <View style={[styles.homeBody, { borderColor: color }]} />
      </View>
    );
  }
  if (type === 'run') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.runHead, { borderColor: color }]} />
        <View style={[styles.runStroke, styles.runTorso, { backgroundColor: color }]} />
        <View style={[styles.runStroke, styles.runArm, { backgroundColor: color }]} />
        <View style={[styles.runStroke, styles.runLegFront, { backgroundColor: color }]} />
        <View style={[styles.runStroke, styles.runLegBack, { backgroundColor: color }]} />
      </View>
    );
  }
  if (type === 'trophy') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.trophyCup, { borderColor: color }]} />
        <View style={[styles.trophyHandleL, { borderColor: color }]} />
        <View style={[styles.trophyHandleR, { borderColor: color }]} />
        <View style={[styles.trophyStem, { backgroundColor: color }]} />
        <View style={[styles.trophyBase, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.iconBox}>
      <View style={[styles.profileHead, { borderColor: color }]} />
      <View style={[styles.profileBody, { borderColor: color }]} />
    </View>
  );
}

const NAV = [
  { key: 'Home', label: 'Home', route: 'Dashboard', icon: 'home' },
  { key: 'Run', label: 'Run', route: 'RunDashboard', icon: 'run' },
  { key: 'Tournament', label: 'Tournament', route: 'TournamentHub', icon: 'trophy' },
  { key: 'Profile', label: 'Profile', route: 'Profile', icon: 'profile' },
];

export function BottomNav({ navigation, active }) {
  return (
    <View style={styles.bottomNav}>
      {NAV.map((item) => {
        const selected = item.key === active;
        const color = selected ? colors.primary : colors.inkMuted;
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={item.label} key={item.key} style={styles.navItem} onPress={() => navigation.navigate(item.route)}>
            <NavIcon type={item.icon} color={color} />
            <Text style={[styles.navLabel, selected && styles.navActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const ui = StyleSheet.create({
  pageContent: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  sectionTitle: { ...type.subtitle, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  muted: { ...type.body, color: colors.inkMuted },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  brandWrap: { alignSelf: 'flex-start' },
  brandLetters: { flexDirection: 'row', alignItems: 'baseline' },
  brandR: { fontSize: 36, fontWeight: '800', color: colors.primary, lineHeight: 42, letterSpacing: -1 },
  brandL: { fontSize: 36, fontWeight: '800', color: colors.ink, lineHeight: 42, marginLeft: 3, letterSpacing: -1 },
  brandLarge: { fontSize: 42, lineHeight: 48 },
  brandCompact: { fontSize: 28, lineHeight: 32 },
  brandCaption: { fontSize: 8, fontWeight: '500', color: colors.ink, marginTop: -3, letterSpacing: 0.3 },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  backButton: { width: 30, justifyContent: 'center' },
  backSpacer: { width: 30 },
  backText: { color: colors.ink, fontSize: 34, lineHeight: 38 },
  headerTitle: { ...type.title, color: colors.ink, flex: 1 },
  headerTitleLeft: { textAlign: 'left' },
  headerRight: { minWidth: 42, alignItems: 'flex-end' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 22, elevation: 4 },
  featureCard: { width: '48.5%', minHeight: 94, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 15, justifyContent: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 2 },
  featureTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  featureSubtitle: { fontSize: 10.5, lineHeight: 14, color: colors.inkMuted, marginTop: 8, paddingRight: 8 },
  chevron: { position: 'absolute', right: 14, top: 34, fontSize: 22, color: colors.inkMuted },
  pressed: { opacity: 0.74 },
  field: { minHeight: 62, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingTop: 8, marginBottom: 12 },
  fieldMultiline: { minHeight: 94 },
  fieldDisabled: { opacity: 0.65 },
  fieldLabel: { ...type.label, color: colors.inkMuted },
  fieldInput: { color: colors.ink, fontSize: 14, paddingVertical: 5, minHeight: 32 },
  fieldInputMultiline: { minHeight: 58, textAlignVertical: 'top' },
  button: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  button_primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface },
  button_outline: { backgroundColor: 'transparent', borderColor: colors.primary },
  button_danger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  buttonText: { ...type.bodyStrong },
  buttonText_primary: { color: colors.onPrimary },
  buttonText_secondary: { color: colors.ink },
  buttonText_outline: { color: colors.primary },
  buttonText_danger: { color: colors.riskHigh },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 30, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.label, color: colors.inkMuted, textTransform: 'uppercase' },
  chipTextActive: { color: colors.onPrimary },
  statCard: { flex: 1, height: 82, padding: 11, justifyContent: 'flex-start' },
  statValue: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 10, color: colors.inkMuted, marginTop: 7 },
  listCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, marginBottom: 12 },
  listLeading: { width: 48, alignItems: 'flex-start' },
  listDot: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: '#36444F' },
  listCopy: { flex: 1, paddingLeft: 10 },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  listSubtitle: { fontSize: 11, lineHeight: 15, color: colors.inkMuted, marginTop: 5 },
  listChevron: { fontSize: 25, color: colors.inkMuted, paddingLeft: 10 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 58, flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderTopWidth: 1, borderTopColor: colors.border },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },

  iconBox: { width: 22, height: 22, position: 'relative' },
  homeRoof: { position: 'absolute', width: 13, height: 13, left: 4.5, top: 2, borderLeftWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }], borderRadius: 1 },
  homeBody: { position: 'absolute', width: 13, height: 10, left: 4.5, top: 9.5, borderWidth: 2, borderTopWidth: 0, borderRadius: 2 },

  runHead: { position: 'absolute', width: 5, height: 5, borderRadius: 3, borderWidth: 1.8, left: 11, top: 1 },
  runStroke: { position: 'absolute', height: 2, borderRadius: 2 },
  runTorso: { width: 11, left: 6, top: 10, transform: [{ rotate: '-48deg' }] },
  runArm: { width: 9, left: 9, top: 9, transform: [{ rotate: '22deg' }] },
  runLegFront: { width: 10, left: 3, top: 17, transform: [{ rotate: '-28deg' }] },
  runLegBack: { width: 10, left: 11, top: 16, transform: [{ rotate: '30deg' }] },
  trophyCup: { position: 'absolute', width: 12, height: 9, left: 5, top: 3, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  trophyHandleL: { position: 'absolute', width: 5, height: 6, left: 1.5, top: 4, borderWidth: 2, borderRightWidth: 0, borderRadius: 4 },
  trophyHandleR: { position: 'absolute', width: 5, height: 6, right: 1.5, top: 4, borderWidth: 2, borderLeftWidth: 0, borderRadius: 4 },
  trophyStem: { position: 'absolute', width: 2, height: 5, left: 10, top: 12 },
  trophyBase: { position: 'absolute', width: 10, height: 2, left: 6, top: 18, borderRadius: 2 },
  profileHead: { position: 'absolute', width: 8, height: 8, borderRadius: 4, left: 7, top: 2, borderWidth: 2 },
  profileBody: { position: 'absolute', width: 16, height: 9, left: 3, top: 12, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  navLabel: { ...type.nav, color: colors.inkMuted, marginTop: 2 },
  navActive: { color: colors.primary, fontWeight: '700' },
});
