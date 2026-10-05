import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import viewGroupDetailsController from '../control/ViewGroupDetailsController.js';
import updateGroupDetailsController from '../control/UpdateGroupDetailsController.js';
import inviteUserToGroupController from '../control/InviteUserToGroupController.js';
import respondToJoinRequestController from '../control/RespondToJoinRequestController.js';
import promoteMemberController from '../control/PromoteMemberController.js';
import removeMemberController from '../control/RemoveMemberController.js';
import { Button, Card, Field, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function ManageGroupSectionScreen({ navigation, route }) {
  const { groupId, section, title } = route.params || {};
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await viewGroupDetailsController(groupId);
    if (result.success) {
      setGroup(result.data.group);
      setMembers(result.data.members || []);
      setName(result.data.group.name || '');
      setDescription(result.data.group.description || '');
      setMaxMembers(result.data.group.maxMembers ? String(result.data.group.maxMembers) : '');
    } else Alert.alert('Could not load group', result.message);
    setLoading(false);
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setBusy(true);
    const result = await updateGroupDetailsController(groupId, { name, description, maxMembers: maxMembers ? Number(maxMembers) : null });
    setBusy(false);
    if (!result.success) return Alert.alert('Could not update group', result.message);
    Alert.alert('Group updated', 'Your changes have been saved.');
    load();
  }

  async function invite() {
    const userId = Number(inviteUserId);
    if (!userId) return Alert.alert('User ID required', 'Enter the numeric user ID of the runner you want to invite.');
    setBusy(true);
    const result = await inviteUserToGroupController(groupId, userId);
    setBusy(false);
    if (!result.success) return Alert.alert('Could not send invite', result.message);
    setInviteUserId('');
    Alert.alert('Invitation sent');
  }

  async function requestDecision(userId, decision) {
    const result = await respondToJoinRequestController(groupId, userId, decision);
    if (!result.success) return Alert.alert('Could not update request', result.message);
    load();
  }

  async function promote(userId) {
    const result = await promoteMemberController(groupId, userId);
    if (!result.success) return Alert.alert('Could not promote member', result.message);
    load();
  }

  function remove(userId, memberName) {
    Alert.alert('Remove member?', `${memberName} will be removed from this group.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const result = await removeMemberController(groupId, userId);
        if (!result.success) Alert.alert('Could not remove member', result.message); else load();
      } },
    ]);
  }

  if (loading) return <Screen><Header title={title || 'Manage Group'} navigation={navigation}/><View style={s.center}><ActivityIndicator color={colors.primary}/></View></Screen>;

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');

  return (
    <Screen>
      <Header title={title || 'Manage Group'} navigation={navigation} />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        {section === 'edit' && (
          <>
            <Text style={s.copy}>Update how this group appears to members.</Text>
            <Field label="Group name" value={name} onChangeText={setName}/>
            <Field label="Description" value={description} onChangeText={setDescription} multiline/>
            <Field label="Maximum members" value={maxMembers} onChangeText={setMaxMembers} keyboardType="number-pad" placeholder="No limit"/>
            <Button onPress={save} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Button>
          </>
        )}

        {section === 'invite' && (
          <>
            <Text style={s.copy}>Send an invitation to another runner.</Text>
            <Field label="User ID" value={inviteUserId} onChangeText={setInviteUserId} keyboardType="number-pad" placeholder="e.g. 42"/>
            <Button onPress={invite} disabled={busy}>{busy ? 'Sending…' : 'Send Invitation'}</Button>
          </>
        )}

        {section === 'requests' && (
          <>
            <Text style={s.copy}>Review runners waiting to join {group?.name || 'this group'}.</Text>
            {pending.length === 0 ? <Card style={s.empty}><Text style={s.help}>No pending requests.</Text></Card> : pending.map((m) => (
              <Card key={m.user_id} style={s.person}>
                <Text style={s.personName}>{m.name}</Text>
                <Text style={s.help}>Waiting for approval</Text>
                <View style={s.actions}>
                  <Button style={s.small} onPress={() => requestDecision(m.user_id, 'accept')}>Accept</Button>
                  <Button variant="secondary" style={s.small} onPress={() => requestDecision(m.user_id, 'reject')}>Reject</Button>
                </View>
              </Card>
            ))}
          </>
        )}

        {section === 'members' && (
          <>
            <Text style={s.copy}>Promote members to admin or remove them from the group.</Text>
            {active.map((m) => (
              <Card key={m.user_id} style={s.person}>
                <Text style={s.personName}>{m.name}</Text>
                <Text style={s.help}>{m.is_admin ? 'Admin' : 'Member'}</Text>
                {!m.is_admin && <View style={s.actions}>
                  <Button variant="secondary" style={s.small} onPress={() => promote(m.user_id)}>Promote</Button>
                  <Button variant="danger" style={s.small} onPress={() => remove(m.user_id, m.name)}>Remove</Button>
                </View>}
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { ...type.body, color: colors.inkMuted, lineHeight: 19, marginTop: 4, marginBottom: 20 },
  help: { ...type.caption, color: colors.inkMuted, lineHeight: 16 },
  empty: { padding: 16 },
  person: { padding: 14, marginBottom: 10 },
  personName: { ...type.bodyStrong, color: colors.ink },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  small: { minHeight: 42, flex: 1 },
});
