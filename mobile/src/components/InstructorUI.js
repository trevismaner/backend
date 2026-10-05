import { View, Text, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Chip } from './AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const NAV = [
  { key: 'Dashboard', label: 'Dashboard', route: 'InstructorDashboard', glyph: '▤' },
  { key: 'Board', label: 'Board', route: 'InstructorBoard', glyph: '✦' },
  { key: 'Create', label: 'Create', route: 'InstructorCreatePost', glyph: '＋' },
  { key: 'Profile', label: 'Profile', route: 'InstructorProfile', glyph: '○' },
];

export function InstructorNav({ navigation, active }) {
  return (
    <View style={s.nav}>
      {NAV.map((item) => {
        const selected = item.key === active;
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

export function VerificationBanner({ verified }) {
  if (verified) return null;
  return (
    <View style={s.banner}>
      <Text style={s.bannerTitle}>Credentials under review</Text>
      <Text style={s.bannerBody}>
        You can write and keep drafts now, but posts stay off the Instructor Board until an
        admin verifies your account.
      </Text>
    </View>
  );
}

export function VerifiedTag({ verified }) {
  return (
    <View style={[s.tag, verified ? s.tagGood : s.tagWarn]}>
      <Text style={[s.tagText, verified ? s.tagTextGood : s.tagTextWarn]}>
        {verified ? '✓ Verified' : 'Pending'}
      </Text>
    </View>
  );
}

export const CATEGORY_LABELS = {
  training: 'Training',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  injury_prevention: 'Injury Prevention',
};

export function categoryLabel(value) {
  return value ? CATEGORY_LABELS[value] ?? value : 'General';
}

export function CategoryChips({ categories, active, onChange, includeAll = true }) {
  return (
    <View style={s.chips}>
      {includeAll && (
        <Chip active={!active} onPress={() => onChange(null)}>All</Chip>
      )}
      {categories.map((c) => (
        <Chip key={c} active={active === c} onPress={() => onChange(c)}>{categoryLabel(c)}</Chip>
      ))}
    </View>
  );
}

export function PostCard({ post, onPress, showAuthor = true, trailing }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed]}>
      <View style={s.cardTop}>
        <Text style={s.cardCategory}>{categoryLabel(post.category).toUpperCase()}</Text>
        <Text style={s.cardRead}>{post.readMinutes} min read</Text>
      </View>
      <Text numberOfLines={2} style={s.cardTitle}>{post.title}</Text>
      {!!post.excerpt && <Text numberOfLines={2} style={s.cardExcerpt}>{post.excerpt}</Text>}
      <View style={s.cardFoot}>
        <Text numberOfLines={1} style={s.cardMeta}>
          {showAuthor ? `${post.authorName}${post.authorVerified ? ' ✓' : ''} · ` : ''}
          {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
        </Text>
        {trailing}
      </View>
    </Pressable>
  );
}

export function Confirm({ visible, title, message, confirmLabel = 'Confirm', onConfirm, onCancel, busy = false }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{title}</Text>
          {!!message && <Text style={s.sheetBody}>{message}</Text>}
          <Pressable disabled={busy} style={({ pressed }) => [s.sheetBtn, s.sheetDanger, pressed && s.pressed, busy && s.disabled]} onPress={onConfirm}>
            {busy ? <ActivityIndicator color={colors.riskHigh} /> : <Text style={s.sheetDangerText}>{confirmLabel}</Text>}
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
  return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

export function Empty({ children }) {
  return <Text style={s.empty}>{children}</Text>;
}

export function ErrorText({ children }) {
  return children ? <Text style={s.error}>{children}</Text> : null;
}

export const instructorStyles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
});

const s = StyleSheet.create({
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 58, flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderTopWidth: 1, borderTopColor: colors.border },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { color: colors.inkMuted, fontSize: 19, height: 22 },
  navLabel: { ...type.nav, color: colors.inkMuted, marginTop: 1 },
  navActive: { color: colors.primary, fontWeight: '700' },

  banner: { backgroundColor: colors.riskModerateBg, borderWidth: 1, borderColor: colors.riskModerate, borderRadius: radius.md, padding: 14, marginBottom: spacing.lg },
  bannerTitle: { ...type.bodyStrong, color: colors.riskModerate },
  bannerBody: { ...type.caption, color: colors.inkMuted, marginTop: 6, lineHeight: 17 },

  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  tagGood: { backgroundColor: colors.riskLowBg, borderColor: colors.riskLow },
  tagWarn: { backgroundColor: colors.riskModerateBg, borderColor: colors.riskModerate },
  tagText: { ...type.label, textTransform: 'uppercase' },
  tagTextGood: { color: colors.riskLow },
  tagTextWarn: { color: colors.riskModerate },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCategory: { ...type.label, color: colors.primary, textTransform: 'uppercase' },
  cardRead: { ...type.caption, color: colors.inkFaint },
  cardTitle: { ...type.subtitle, color: colors.ink, marginTop: 8 },
  cardExcerpt: { ...type.caption, color: colors.inkMuted, marginTop: 8, lineHeight: 17 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 },
  cardMeta: { ...type.caption, color: colors.inkFaint, flex: 1 },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, paddingBottom: 34, gap: 10 },
  sheetTitle: { ...type.title, color: colors.ink },
  sheetBody: { ...type.body, color: colors.inkMuted, marginBottom: 6 },
  sheetBtn: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sheetDanger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  sheetGhost: { backgroundColor: 'transparent', borderColor: colors.border },
  sheetDangerText: { ...type.bodyStrong, color: colors.riskHigh },
  sheetGhostText: { ...type.bodyStrong, color: colors.inkMuted },

  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  center: { paddingVertical: 48, alignItems: 'center' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: 28, lineHeight: 20 },
  error: { ...type.body, color: colors.riskHigh, paddingVertical: 10 },
});
