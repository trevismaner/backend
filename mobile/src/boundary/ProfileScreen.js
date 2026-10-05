import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext.js';
import updateProfileController from '../control/UpdateProfileController.js';
import viewProfileController from '../control/ViewProfileController.js';
import viewUserBadgesController from '../control/ViewUserBadgesController.js';
import setBadgeDisplayController from '../control/SetBadgeDisplayController.js';
import shareBadgeController from '../control/ShareBadgeController.js';
import { Screen, Field, Button, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

const badgeId = (b) => b.badgeId ?? b.badge_id;
const isDisplayed = (b) => b.isDisplayed ?? b.is_displayed;
const earnedAt = (b) => b.earnedAt ?? b.earned_at;

export default function ProfileScreen({ navigation }) {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [badges, setBadges] = useState([]);
  const [totals, setTotals] = useState({ km: 0, runs: 0 });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBadges = useCallback(async () => {
    const r = await viewUserBadgesController();
    if (r.success) setBadges(r.data.badges || []);
  }, []);

  /**
   * Reads the profile and badges back from the server.
   *
   * The totals come from GET /profile, which adds them up in SQL. Summing a page of run
   * history in the app was both wasteful and wrong — the request was refused once the
   * history outgrew one page, so the distance and run counts sat at zero for good.
   */
  const load = useCallback(async () => {
    const [profile, _badges] = await Promise.all([viewProfileController(), loadBadges()]);
    if (!profile.success) return;

    const stats = profile.data.stats;
    if (stats) setTotals({ km: Number(stats.totalDistanceKm) || 0, runs: stats.runCount || 0 });

    // The server is the authority on the name and bio: an admin may have changed them, or
    // they may have been edited on another device. Push it back into the session so the rest
    // of the app sees the same thing.
    if (profile.data.user) setUser(profile.data.user);
  }, [loadBadges, setUser]);

  // Runs on mount and every time the tab is opened again, so logging a run and coming back
  // here shows the new totals rather than whatever was true when the screen first loaded.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Not while editing: a refresh landing mid-edit must not wipe what is being typed.
  useEffect(() => {
    if (editing) return;
    setName(user?.name || '');
    setBio(user?.bio || '');
  }, [user, editing]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function save() {
    setSaving(true);
    const r = await updateProfileController({ name, bio });
    setSaving(false);
    if (r.success) {
      setUser(r.data.user);
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } else {
      Alert.alert('Could not update profile', r.message);
    }
  }

  async function toggleDisplay(badge) {
    const next = !isDisplayed(badge);
    setBadges((prev) => prev.map((b) => (badgeId(b) === badgeId(badge) ? { ...b, isDisplayed: next, is_displayed: next } : b)));
    const r = await setBadgeDisplayController({ badgeId: badgeId(badge), isDisplayed: next });
    if (!r.success) {
      Alert.alert('Could not update badge', r.message);
      loadBadges(); // put the switch back where the server says it is
    }
  }

  const display = user?.name || name || 'Runner';
  const earned = badges.filter((b) => earnedAt(b));
  const shown = earned.filter((b) => isDisplayed(b));

  return (
    <Screen>
      <View style={s.header}>
        <Text style={s.headerTitle}>{editing ? 'Edit Profile' : 'Profile'}</Text>
        {!editing ? (
          <Pressable style={s.settings} onPress={() => navigation.navigate('ProfileSettings')}>
            <Text style={s.settingsText}>Settings</Text>
          </Pressable>
        ) : <View style={{ width: 84 }} />}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={s.hero}>
          <View style={s.avatar}><Text style={s.initial}>{display[0]?.toUpperCase()}</Text></View>
          <Text style={s.name}>{display}</Text>
          {!!user?.bio && <Text style={s.bio}>{user.bio}</Text>}
        </View>

        <View style={s.stats}>
          {[[totals.km.toFixed(1), 'km'], [String(totals.runs), 'Runs'], [String(earned.length), 'Badges']]
            .map(([v, l]) => (
              <View key={l} style={s.stat}>
                <Text style={s.statV}>{v}</Text>
                <Text style={s.statL}>{l}</Text>
              </View>
            ))}
        </View>

        {editing ? (
          <View>
            <Text style={s.section}>Personal Information</Text>
            <Field label="Name" value={name} onChangeText={setName} />
            <Field label="Bio" value={bio} onChangeText={setBio} multiline />
            <Button onPress={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="secondary" style={{ marginTop: 10 }} onPress={() => { setName(user?.name || ''); setBio(user?.bio || ''); setEditing(false); }}>
              Cancel
            </Button>
          </View>
        ) : (
          <>
            <Text style={s.section}>Goals</Text>
            <Pressable style={s.list} onPress={() => navigation.navigate('FitnessPlan')}>
              <View style={s.tile}><Text style={s.tileGlyph}>▣</Text></View>
              <View style={s.listCopy}>
                <Text style={s.listTitle}>Your fitness plan</Text>
                <Text style={s.listSub}>Set a goal and track it week by week</Text>
              </View>
              <Text style={s.chev}>›</Text>
            </Pressable>

            {}
            <View style={s.achHead}>
              <Text style={s.section}>Achievements</Text>
              {earned.length > 0 && (
                <Text style={s.achCount}>{shown.length} of {earned.length} shown</Text>
              )}
            </View>

            {earned.length === 0 ? (
              <Pressable style={s.list} onPress={() => navigation.navigate('Rewards')}>
                <View style={s.tile}><Text style={s.tileGlyph}>♧</Text></View>
                <View style={s.listCopy}>
                  <Text style={s.listTitle}>No badges yet</Text>
                  <Text style={s.listSub}>Log your first run to earn First Steps</Text>
                </View>
                <Text style={s.chev}>›</Text>
              </Pressable>
            ) : (
              earned.map((badge) => {
                const on = isDisplayed(badge);
                return (
                  <View key={badgeId(badge)} style={[s.badge, !on && s.badgeHidden]}>
                    <View style={[s.tile, !on && s.tileHidden]}><Text style={s.tileGlyph}>♧</Text></View>
                    <View style={s.listCopy}>
                      <Text style={s.listTitle}>{badge.name}</Text>
                      <Text style={s.listSub} numberOfLines={1}>
                        {badge.description || 'Earned'}
                        {earnedAt(badge) ? ` · ${new Date(earnedAt(badge)).toLocaleDateString()}` : ''}
                      </Text>
                    </View>
                    <View style={s.badgeActions}>
                      <Pressable hitSlop={8} onPress={() => toggleDisplay(badge)}>
                        <Text style={[s.badgeAction, on ? s.onProfile : s.offProfile]}>
                          {on ? 'On profile' : 'Hidden'}
                        </Text>
                      </Pressable>
                      {}
                      <Pressable hitSlop={8} onPress={() => shareBadgeController(badge)}>
                        <Text style={s.share}>Share</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
            {earned.length > 0 && (
              <Text style={s.hint}>Tap “On profile” to hide a badge from other runners.</Text>
            )}

            <Button style={{ marginTop: 32 }} onPress={() => setEditing(true)}>Update Profile</Button>
          </>
        )}
      </ScrollView>
      <BottomNav navigation={navigation} active="Profile" />
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  back: { fontSize: 34, color: colors.ink, width: 30 },
  headerTitle: { fontSize: 23, fontWeight: '700', color: colors.ink, flex: 1 },
  settings: { width: 84, height: 34, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  hero: { alignItems: 'center', paddingTop: 18 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#323E48', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 38, fontWeight: '700', color: colors.primary },
  name: { fontSize: 26, fontWeight: '700', color: colors.ink, marginTop: 16 },
  bio: { fontSize: 12, color: colors.inkMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  stats: { flexDirection: 'row', gap: 17, marginTop: 28 },
  stat: { flex: 1, height: 82, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11 },
  statV: { fontSize: 20, fontWeight: '700', color: colors.ink },
  statL: { fontSize: 10, color: colors.inkMuted, marginTop: 10 },
  section: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 28, marginBottom: 12 },
  achHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  achCount: { fontSize: 11, color: colors.inkMuted },
  list: { height: 82, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  badge: { minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12, marginBottom: 10 },
  badgeHidden: { opacity: 0.55 },
  badgeActions: { alignItems: 'flex-end', gap: 8 },
  badgeAction: { fontSize: 10, fontWeight: '700' },
  onProfile: { color: colors.success },
  offProfile: { color: colors.inkFaint },
  share: { fontSize: 10, fontWeight: '700', color: colors.primary },
  tile: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#36444F', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  tileHidden: { opacity: 0.5 },
  tileGlyph: { fontSize: 18, color: colors.primary },
  listCopy: { flex: 1, marginLeft: 14, marginRight: 10 },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  listSub: { fontSize: 11, color: colors.inkMuted, marginTop: 6 },
  hint: { fontSize: 11, color: colors.inkFaint, marginTop: 4, lineHeight: 16 },
  chev: { fontSize: 22, color: colors.inkMuted },
});
