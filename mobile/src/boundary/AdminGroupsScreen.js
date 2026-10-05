import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import adminListGroupsController from '../control/AdminListGroupsController.js';
import adminSetGroupSuspensionController from '../control/AdminSetGroupSuspensionController.js';
import adminDeleteGroupController from '../control/AdminDeleteGroupController.js';
import { Screen, Header, Field, Chip, Card } from '../components/AppUI.js';
import { AdminNav, Pill, Confirm, Loading, Empty, ErrorText, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const FILTERS = [
  { key: 'ALL', label: 'All', params: {} },
  { key: 'ACTIVE', label: 'Active', params: { suspended: false } },
  { key: 'SUSPENDED', label: 'Suspended', params: { suspended: true } },
];

export default function AdminGroupsScreen({ navigation, route }) {
  const [filter, setFilter] = useState(route?.params?.suspended ? 'SUSPENDED' : 'ALL');
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    const result = await adminListGroupsController({ ...active.params, search: search.trim() || undefined, limit: 50 });
    if (result.success) {
      setGroups(result.data.groups || []);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  // Refreshes when returning from AdminEditGroup, so a rename shows immediately.
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  async function run(call) {
    setBusy(true);
    const result = await call();
    setBusy(false);
    setConfirm(null);
    if (result.success) await load();
    else setError(result.message);
  }

  function askSuspend(group) {
    const suspending = !group.isSuspended;
    setConfirm({
      title: suspending ? `Suspend "${group.name}"?` : `Reinstate "${group.name}"?`,
      message: suspending
        ? 'The group and its tournaments will be hidden from members until reinstated.'
        : 'Members will see the group again immediately.',
      confirmLabel: suspending ? 'Suspend' : 'Reinstate',
      destructive: suspending,
      run: () => run(() => adminSetGroupSuspensionController({ groupId: group.groupId, isSuspended: suspending })),
    });
  }

  function askDelete(group) {
    setConfirm({
      title: `Delete "${group.name}"?`,
      message: `This removes the group, its ${group.memberCount ?? 0} membership${group.memberCount === 1 ? '' : 's'} and every tournament inside it. It cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      run: () => run(() => adminDeleteGroupController(group.groupId)),
    });
  }

  return (
    <Screen>
      <Header title="Groups" navigation={navigation} />
      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.groupId)}
        contentContainerStyle={adminStyles.content}
        ListHeaderComponent={
          <>
            <Field label="Search" value={search} onChangeText={setSearch} placeholder="Group name" />
            <View style={s.chips}>
              {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>{f.label}</Chip>)}
            </View>
            <ErrorText>{error}</ErrorText>
          </>
        }
        renderItem={({ item }) => (
          <Card style={s.card}>
            <View style={s.cardTop}>
              <View style={s.cardCopy}>
                <Text numberOfLines={1} style={s.cardTitle}>{item.name}</Text>
                <Text style={s.cardMeta}>
                  {item.memberCount ?? 0} member{item.memberCount === 1 ? '' : 's'}
                  {item.maxMembers ? ` / ${item.maxMembers}` : ''} · by {item.creatorName || 'unknown'}
                </Text>
              </View>
              <View style={s.cardPills}>
                {item.isPrivate && <Pill tone="neutral">Private</Pill>}
                <Pill tone={item.isSuspended ? 'bad' : 'good'}>{item.isSuspended ? 'Suspended' : 'Active'}</Pill>
              </View>
            </View>
            {!!item.description && <Text numberOfLines={2} style={s.cardDesc}>{item.description}</Text>}
            <View style={s.cardActions}>
              {/* SA-21: rename or re-cap instead of deleting and losing the members */}
              <Pressable disabled={busy} onPress={() => navigation.navigate('AdminEditGroup', { group: item })} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                <Text style={s.actionText}>Edit</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => askSuspend(item)} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                <Text style={s.actionText}>{item.isSuspended ? 'Reinstate' : 'Suspend'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => askDelete(item)} style={({ pressed }) => [s.action, s.actionDanger, pressed && s.pressed]}>
                <Text style={[s.actionText, s.actionDangerText]}>Delete</Text>
              </Pressable>
            </View>
          </Card>
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty>No groups match this filter.</Empty>}
      />
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
      <AdminNav navigation={navigation} active="Groups" />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  card: { padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  cardPills: { gap: 6, alignItems: 'flex-end' },
  cardDesc: { ...type.caption, color: colors.inkFaint, marginTop: 10, lineHeight: 17 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  actionDanger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  actionText: { ...type.caption, fontWeight: '600', color: colors.ink },
  actionDangerText: { color: colors.riskHigh },
  pressed: { opacity: 0.72 },
});
