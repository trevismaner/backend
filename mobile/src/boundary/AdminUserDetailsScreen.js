import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import adminViewUserController from '../control/AdminViewUserController.js';
import adminSetUserSuspensionController from '../control/AdminSetUserSuspensionController.js';
import adminUpdateUserRoleController from '../control/AdminUpdateUserRoleController.js';
import adminSetInstructorVerificationController from '../control/AdminSetInstructorVerificationController.js';
import adminDeleteUserController from '../control/AdminDeleteUserController.js';
import adminListBadgesController from '../control/AdminListBadgesController.js';
import adminAwardBadgeController from '../control/AdminAwardBadgeController.js';
import { Screen, Header, Card, Button, Chip } from '../components/AppUI.js';
import { Pill, Row, SectionLabel, Confirm, Loading, ErrorText } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const ROLES = [
  { value: 'registered_user', label: 'Runner' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'system_admin', label: 'Admin' },
];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function AdminUserDetailsScreen({ navigation, route }) {
  const { userId } = route.params;
  const { user: me } = useAuth();
  const [user, setUser] = useState(null);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, run }

  const isSelf = me?.userId === userId;

  const load = useCallback(async () => {
    const [detail, badgeList] = await Promise.all([adminViewUserController(userId), adminListBadgesController()]);
    if (detail.success) {
      setUser(detail.data.user);
      setError('');
    } else {
      setError(detail.message);
    }
    if (badgeList.success) setBadges(badgeList.data.badges || []);
    setLoading(false);
  }, [userId]);

  // Runs on mount and again on every focus, so a saved edit from AdminEditUser shows
  // immediately on return. useFocusEffect covers both; a bare 'focus' listener does not.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function act(controllerCall, successMessage) {
    setBusy(true);
    setError('');
    const result = await controllerCall();
    setBusy(false);
    setConfirm(null);
    if (result.success) {
      setNotice(successMessage);
      await load();
    } else {
      setError(result.message);
    }
  }

  function askSuspend() {
    const suspending = !user.isSuspended;
    setConfirm({
      title: suspending ? `Suspend ${user.name}?` : `Reactivate ${user.name}?`,
      message: suspending
        ? 'They will be signed out and blocked from signing in again until reactivated.'
        : 'They will be able to sign in again immediately.',
      confirmLabel: suspending ? 'Suspend' : 'Reactivate',
      destructive: suspending,
      run: () => act(
        () => adminSetUserSuspensionController({ userId, isSuspended: suspending }),
        suspending ? 'Account suspended.' : 'Account reactivated.'
      ),
    });
  }

  function askRole(role) {
    const label = ROLES.find((r) => r.value === role)?.label ?? role;
    setConfirm({
      title: `Change role to ${label}?`,
      message: role === 'system_admin'
        ? 'Admins get full access to this console, including the ability to delete accounts.'
        : `${user.name} will get the ${label.toLowerCase()} experience next time they open the app.`,
      confirmLabel: 'Change role',
      destructive: false,
      run: () => act(() => adminUpdateUserRoleController({ userId, role }), `Role changed to ${label}.`),
    });
  }

  function askVerify() {
    const verifying = !user.credentialsVerified;
    setConfirm({
      title: verifying ? 'Verify this instructor?' : 'Remove verification?',
      message: verifying
        ? 'Their posts will be marked as coming from a verified coach.'
        : 'Their verified marking will be removed from the instructor board.',
      confirmLabel: verifying ? 'Verify' : 'Remove',
      destructive: !verifying,
      run: () => act(
        () => adminSetInstructorVerificationController({ userId, verified: verifying }),
        verifying ? 'Instructor verified.' : 'Verification removed.'
      ),
    });
  }

  function askDelete() {
    setConfirm({
      title: `Delete ${user.name}?`,
      message: 'This permanently removes the account along with their runs, group memberships and tournament entries. It cannot be undone.',
      confirmLabel: 'Delete permanently',
      destructive: true,
      run: async () => {
        setBusy(true);
        const result = await adminDeleteUserController(userId);
        setBusy(false);
        setConfirm(null);
        if (result.success) navigation.goBack();
        else setError(result.message);
      },
    });
  }

  function askAward(badge) {
    setConfirm({
      title: `Award "${badge.name}"?`,
      message: `${user.name} will get this badge and a notification about it.`,
      confirmLabel: 'Award badge',
      destructive: false,
      run: () => act(() => adminAwardBadgeController({ userId, badgeId: badge.badgeId }), `Awarded "${badge.name}".`),
    });
  }

  if (loading) {
    return <Screen><Header title="Account" navigation={navigation} /><Loading /></Screen>;
  }

  if (!user) {
    return (
      <Screen>
        <Header title="Account" navigation={navigation} />
        <View style={s.page}><ErrorText>{error || 'This account could not be loaded.'}</ErrorText></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Account" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.name}>{user.name}</Text>
        <Text style={s.email}>{user.email}</Text>
        <View style={s.pills}>
          <Pill tone={user.role === 'system_admin' ? 'good' : 'neutral'}>
            {ROLES.find((r) => r.value === user.role)?.label ?? user.role}
          </Pill>
          <Pill tone={user.isSuspended ? 'bad' : 'good'}>{user.isSuspended ? 'Suspended' : 'Active'}</Pill>
          {user.role === 'instructor' && (
            <Pill tone={user.credentialsVerified ? 'good' : 'warn'}>
              {user.credentialsVerified ? 'Verified' : 'Unverified'}
            </Pill>
          )}
          {user.isGroupAdmin && <Pill tone="neutral">Group admin</Pill>}
        </View>

        {!!notice && <Text style={s.notice}>{notice}</Text>}
        <ErrorText>{error}</ErrorText>

        {/* SA-11: what the instructor actually submitted, so there is something to verify. */}
        {user.role === 'instructor' && (
          <>
            <SectionLabel>Submitted credentials</SectionLabel>
            <Card style={s.card}>
              {user.credentialSubmittedAt ? (
                <>
                  <Row label="Qualification" value={user.credentialQualification || '—'} />
                  <Row label="Reference" value={user.credentialReference || '—'} />
                  <Row label="Submitted" value={formatDate(user.credentialSubmittedAt)} />
                </>
              ) : (
                <Text style={s.muted}>
                  This instructor has not submitted any credentials yet. There is nothing to
                  verify — ask them to submit from Profile → Submit Credentials.
                </Text>
              )}
            </Card>
          </>
        )}

        <SectionLabel>Details</SectionLabel>
        <Card style={s.card}>
          <Row label="User ID" value={user.userId} />
          <Row label="Joined" value={formatDate(user.createdAt)} />
          <Row label="Last updated" value={formatDate(user.updatedAt)} />
          <Row label="Bio" value={user.bio || '—'} />
        </Card>

        {isSelf && <Text style={s.selfNote}>This is your own account. Role, suspension and deletion are disabled here so you cannot lock yourself out.</Text>}

        <SectionLabel>Role</SectionLabel>
        <View style={s.chips}>
          {ROLES.map((r) => (
            <Chip key={r.value} active={user.role === r.value} onPress={() => !isSelf && user.role !== r.value && askRole(r.value)}>
              {r.label}
            </Chip>
          ))}
        </View>

        <SectionLabel>Actions</SectionLabel>
        <View style={s.actions}>
          {/* SA-06: fix the things that lock a user out — name, email, password */}
          <Button
            variant="secondary"
            disabled={busy}
            onPress={() => navigation.navigate('AdminEditUser', { user })}
          >
            Edit Details
          </Button>
          {user.role === 'instructor' && (
            <Button variant="secondary" onPress={askVerify} disabled={busy}>
              {user.credentialsVerified ? 'Remove Verification' : 'Verify Instructor'}
            </Button>
          )}
          <Button variant={user.isSuspended ? 'secondary' : 'danger'} onPress={askSuspend} disabled={busy || isSelf}>
            {user.isSuspended ? 'Reactivate Account' : 'Suspend Account'}
          </Button>
          <Button variant="danger" onPress={askDelete} disabled={busy || isSelf}>Delete Account</Button>
        </View>

        <SectionLabel>Award a badge</SectionLabel>
        {badges.length === 0 ? (
          <Text style={s.muted}>No badges in the catalog yet.</Text>
        ) : (
          <View style={s.chips}>
            {badges.map((b) => (
              <Pressable key={b.badgeId} onPress={() => askAward(b)} style={({ pressed }) => [s.badge, pressed && s.pressed]}>
                <Text style={s.badgeText}>{b.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={s.hint}>Awarding a badge the user already has will be rejected by the server.</Text>
      </ScrollView>

      <Confirm
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        busy={busy}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  name: { ...type.title, color: colors.ink, marginTop: spacing.sm },
  email: { ...type.body, color: colors.inkMuted, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  notice: { ...type.body, color: colors.success, marginTop: spacing.md },
  card: { padding: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 12 },
  selfNote: { ...type.caption, color: colors.riskModerate, marginTop: spacing.md, lineHeight: 17 },
  badge: { paddingHorizontal: 14, minHeight: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  badgeText: { ...type.caption, color: colors.ink },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: spacing.md, lineHeight: 17 },
  muted: { ...type.body, color: colors.inkMuted },
  pressed: { opacity: 0.72 },
});
