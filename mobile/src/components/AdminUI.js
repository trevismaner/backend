import { View, Text, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const ADMIN_NAV = [
  { key: 'Dashboard', label: 'Dashboard', route: 'AdminDashboard', glyph: '⌂' },
  { key: 'Users', label: 'Users', route: 'AdminUsers', glyph: '♙' },
  { key: 'Events', label: 'Events', route: 'AdminPublicEvents', glyph: '◈' },
  { key: 'Manage', label: 'Manage', route: 'AdminContent', glyph: '☷' },
];

export function AdminNav({ navigation, active }) {
  return (
    <View style={s.nav}>
      {ADMIN_NAV.map((item) => {
        const selected = item.key === active || (item.key === 'Dashboard' && active === 'Overview') || (item.key === 'Manage' && ['Groups','Content','Runs','Audit'].includes(active));
        return (
          <Pressable key={item.key} style={s.navItem} onPress={() => navigation.navigate(item.route)}>
            <Text style={[s.navGlyph, selected && s.navActive]}>{item.glyph}</Text>
            <Text style={[s.navLabel, selected && s.navActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  return (
    <View style={[s.pill, s[`pill_${tone}`]]}>
      <Text style={[s.pillText, s[`pillText_${tone}`]]}>{children}</Text>
    </View>
  );
}

export function Row({ label, value, tone }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[s.rowValue, tone && { color: colors[tone] }]}>{String(value)}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function SectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

export function Confirm({ visible, title, message, confirmLabel = 'Confirm', destructive = true, onConfirm, onCancel, busy = false }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{title}</Text>
          {!!message && <Text style={s.sheetBody}>{message}</Text>}
          <Pressable
            disabled={busy}
            style={({ pressed }) => [s.sheetBtn, destructive ? s.sheetDanger : s.sheetPrimary, pressed && s.pressed, busy && s.disabled]}
            onPress={onConfirm}
          >
            {busy ? (
              <ActivityIndicator color={destructive ? colors.riskHigh : colors.onPrimary} />
            ) : (
              <Text style={[s.sheetBtnText, destructive && s.sheetDangerText]}>{confirmLabel}</Text>
            )}
          </Pressable>
          <Pressable disabled={busy} style={({ pressed }) => [s.sheetBtn, s.sheetGhost, pressed && s.pressed]} onPress={onCancel}>
            <Text style={s.sheetGhostText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Empty({ children }) {
  return <Text style={s.empty}>{children}</Text>;
}

export function ErrorText({ children }) {
  return children ? <Text style={s.error}>{children}</Text> : null;
}

export const adminStyles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  actions: { gap: 12, marginTop: spacing.lg },
});

const s = StyleSheet.create({
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 58, flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderTopWidth: 1, borderTopColor: colors.border },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { color: colors.inkMuted, fontSize: 19, height: 22 },
  navLabel: { ...type.nav, color: colors.inkMuted, marginTop: 1 },
  navActive: { color: colors.primary, fontWeight: '700' },

  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  pill_neutral: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  pill_good: { backgroundColor: colors.riskLowBg, borderColor: colors.riskLow },
  pill_warn: { backgroundColor: colors.riskModerateBg, borderColor: colors.riskModerate },
  pill_bad: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  pillText: { ...type.label, textTransform: 'uppercase' },
  pillText_neutral: { color: colors.inkMuted },
  pillText_good: { color: colors.riskLow },
  pillText_warn: { color: colors.riskModerate },
  pillText_bad: { color: colors.riskHigh },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8, gap: 12 },
  rowLabel: { ...type.body, color: colors.inkMuted },
  rowValue: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  sectionLabel: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, paddingBottom: 34, gap: 10 },
  sheetTitle: { ...type.title, color: colors.ink },
  sheetBody: { ...type.body, color: colors.inkMuted, marginBottom: 6 },
  sheetBtn: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sheetPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  sheetDanger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  sheetGhost: { backgroundColor: 'transparent', borderColor: colors.border },
  sheetBtnText: { ...type.bodyStrong, color: colors.onPrimary },
  sheetDangerText: { color: colors.riskHigh },
  sheetGhostText: { ...type.bodyStrong, color: colors.inkMuted },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },

  center: { paddingVertical: 48, alignItems: 'center' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: 28 },
  error: { ...type.body, color: colors.riskHigh, paddingVertical: 10 },
});
