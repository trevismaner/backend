import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import viewGroupDetailsController from '../control/ViewGroupDetailsController.js';
import viewGroupTournamentsController from '../control/ViewGroupTournamentsController.js';
import joinGroupController from '../control/JoinGroupController.js';
import leaveGroupController from '../control/LeaveGroupController.js';
import { useAuth } from '../context/AuthContext.js';
import { BottomNav, Button, Card, Header, ListCard, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function GroupDetailsScreen({ navigation, route }) {
  const groupId = route.params?.groupId ?? route.params?.id;
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!groupId) {
      setError('This group could not be opened.');
      setLoading(false);
      return;
    }
    setError('');
    const [groupResult, tournamentResult] = await Promise.all([
      viewGroupDetailsController(groupId),
      viewGroupTournamentsController(groupId),
    ]);
    if (groupResult.success) {
      setGroup(groupResult.data.group);
      setMembers(groupResult.data.members || []);
    } else {
      setError(groupResult.message || 'Could not load this group.');
    }
    if (tournamentResult.success) setTournaments(tournamentResult.data.tournaments || []);
    setLoading(false);
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentUserId = user?.userId ?? user?.user_id;
  const membership = useMemo(() => members.find((m) => Number(m.user_id) === Number(currentUserId)), [members, currentUserId]);
  const isMember = membership?.status === 'active';
  const isAdmin = Boolean(isMember && membership?.is_admin);
  const activeMembers = members.filter((m) => m.status === 'active');

  async function join() {
    setBusy(true);
    const result = await joinGroupController(groupId);
    setBusy(false);
    if (!result.success) return Alert.alert('Could not join group', result.message);
    await load();
    Alert.alert(group?.isPrivate ? 'Request sent' : 'Joined group', group?.isPrivate ? 'Your request is waiting for approval.' : `You are now a member of ${group.name}.`);
  }

  function confirmLeave() {
    Alert.alert('Leave group?', `You will leave ${group.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  }

  async function leave() {
    setBusy(true);
    const result = await leaveGroupController(groupId);
    setBusy(false);
    if (!result.success) return Alert.alert('Could not leave group', result.message);
    navigation.navigate('GroupsHub');
  }

  if (loading) {
    return <Screen><Header title="Group Details" navigation={navigation}/><View style={styles.center}><ActivityIndicator color={colors.primary} size="large"/></View></Screen>;
  }

  if (!group || error) {
    return <Screen><Header title="Group Details" navigation={navigation}/><View style={styles.center}><Text style={styles.error}>{error || 'Group not found.'}</Text><Button style={styles.retry} onPress={load}>Try Again</Button></View></Screen>;
  }

  return (
    <Screen>
      <Header title="Group Details" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.groupMark}><Text style={styles.groupMarkText}>{group.name?.slice(0, 1)?.toUpperCase() || 'G'}</Text></View>
            <View style={styles.heroCopy}>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.meta}>{activeMembers.length} member{activeMembers.length === 1 ? '' : 's'}{group.maxMembers ? ` · ${group.maxMembers} max` : ''}</Text>
            </View>
          </View>
          <View style={styles.chips}>
            <View style={styles.statusPill}><Text style={styles.statusPillText}>{group.isPrivate ? 'PRIVATE' : 'PUBLIC'}</Text></View>
            {isAdmin && <View style={styles.statusPill}><Text style={styles.statusPillText}>ADMIN</Text></View>}
            {isMember && !isAdmin && <View style={styles.statusPill}><Text style={styles.statusPillText}>MEMBER</Text></View>}
          </View>
        </Card>

        <Text style={styles.section}>About</Text>
        <Text style={styles.description}>{group.description || 'This group has not added a description yet.'}</Text>

        {!isMember && membership?.status !== 'pending' && <Button onPress={join} disabled={busy}>{busy ? 'Joining…' : group.isPrivate ? 'Request to Join' : 'Join Group'}</Button>}
        {membership?.status === 'pending' && <Card style={styles.pending}><Text style={styles.pendingTitle}>Join request pending</Text><Text style={styles.pendingText}>A group admin needs to approve your request.</Text></Card>}

        {isMember && (
          <View style={styles.quickGrid}>
            <Pressable style={styles.quick} onPress={() => navigation.navigate('GroupLeaderboard', { groupId, groupName: group.name })}>
              <View style={styles.quickLineIcon}><View style={styles.quickBar}/><View style={styles.quickBarShort}/></View><Text style={styles.quickTitle}>Leaderboard</Text><Text style={styles.quickSub}>See group rankings</Text>
            </Pressable>
            <Pressable style={styles.quick} onPress={() => isAdmin ? navigation.navigate('ManageGroup', { groupId }) : navigation.navigate('GroupsList')}>
              <View style={styles.quickLineIcon}><View style={styles.quickCircle}/><View style={styles.quickStem}/></View><Text style={styles.quickTitle}>{isAdmin ? 'Manage' : 'Discover'}</Text><Text style={styles.quickSub}>{isAdmin ? 'Members and requests' : 'Find more groups'}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.section}>Members</Text>
        <Card style={styles.membersCard}>
          {activeMembers.slice(0, 5).map((member, index) => (
            <View key={member.user_id} style={[styles.member, index < Math.min(activeMembers.length, 5) - 1 && styles.memberBorder]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{member.name?.slice(0,1)?.toUpperCase() || '?'}</Text></View>
              <View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberRole}>{member.is_admin ? 'Group admin' : 'Member'}</Text></View>
            </View>
          ))}
          {activeMembers.length === 0 && <Text style={styles.muted}>No active members yet.</Text>}
        </Card>

        <View style={styles.sectionRow}><Text style={[styles.section, styles.sectionNoTop]}>Tournaments</Text>{isAdmin && <Pressable onPress={() => navigation.navigate('CreateTournament', { groupId })}><Text style={styles.link}>Create</Text></Pressable>}</View>
        {tournaments.length ? tournaments.map((t) => (
          <ListCard key={t.tournamentId} title={t.name} subtitle={`${t.distanceType || 'Open distance'} · ${t.status || 'draft'}`} onPress={() => navigation.navigate('TournamentDetails', { tournamentId: t.tournamentId })}/>
        )) : <Card style={styles.emptyCard}><Text style={styles.muted}>No tournaments have been created for this group yet.</Text></Card>}

        {!isAdmin && isMember ? <Button variant="danger" style={styles.manage} onPress={confirmLeave}>Leave Group</Button> : null}
      </ScrollView>
      <BottomNav navigation={navigation} active="Home" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 104 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  error: { ...type.body, color: colors.riskHigh, textAlign: 'center' }, retry: { marginTop: 18, width: 180 },
  hero: { padding: 17, minHeight: 150 }, heroTop: { flexDirection: 'row', alignItems: 'center' },
  groupMark: { width: 58, height: 58, borderRadius: 17, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  groupMarkText: { fontSize: 24, fontWeight: '800', color: colors.primary }, heroCopy: { flex: 1, marginLeft: 14 },
  groupName: { fontSize: 22, fontWeight: '700', color: colors.ink }, meta: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 17 }, statusPill: { minHeight: 30, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, statusPillText: { ...type.label, color: colors.ink, textTransform: 'uppercase' }, section: { ...type.subtitle, color: colors.ink, marginTop: 24, marginBottom: 10 },
  sectionNoTop: { marginTop: 0, marginBottom: 0 }, description: { ...type.body, color: colors.inkMuted, lineHeight: 20, marginBottom: 20 },
  pending: { padding: 16, marginBottom: 18 }, pendingTitle: { ...type.bodyStrong, color: colors.warning }, pendingText: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  quickGrid: { flexDirection: 'row', gap: 10, marginTop: 6 }, quick: { flex: 1, minHeight: 106, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  quickLineIcon: { width: 24, height: 24, position: 'relative' }, quickBar: { position: 'absolute', width: 17, height: 2, left: 2, top: 8, backgroundColor: colors.primary, borderRadius: 2 }, quickBarShort: { position: 'absolute', width: 11, height: 2, left: 7, top: 14, backgroundColor: colors.primary, borderRadius: 2 }, quickCircle: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, left: 2, top: 2 }, quickStem: { position: 'absolute', width: 8, height: 2, backgroundColor: colors.primary, transform: [{ rotate: '45deg' }], left: 12, top: 14, borderRadius: 2 }, quickTitle: { ...type.bodyStrong, color: colors.ink, marginTop: 9 }, quickSub: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  membersCard: { paddingHorizontal: 14 }, member: { minHeight: 66, flexDirection: 'row', alignItems: 'center' }, memberBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontWeight: '700', color: colors.primary },
  memberCopy: { marginLeft: 11 }, memberName: { ...type.bodyStrong, color: colors.ink }, memberRole: { ...type.caption, color: colors.inkMuted, marginTop: 2 }, muted: { ...type.body, color: colors.inkMuted },
  sectionRow: { marginTop: 26, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, link: { ...type.bodyStrong, color: colors.primary },
  emptyCard: { padding: 16 }, manage: { marginTop: 26 },
});
