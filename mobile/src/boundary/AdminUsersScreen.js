import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import adminListUsersController from '../control/AdminListUsersController.js';
import { Screen, Header, Field, ListCard, Chip, Button } from '../components/AppUI.js';
import { AdminNav, Pill, Loading, Empty, ErrorText, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const FILTERS = [
  { key: 'ALL', label: 'All', params: {} },
  { key: 'RUNNERS', label: 'Runners', params: { role: 'registered_user' } },
  { key: 'INSTRUCTORS', label: 'Instructors', params: { role: 'instructor' } },
  { key: 'ADMINS', label: 'Admins', params: { role: 'system_admin' } },
  { key: 'SUSPENDED', label: 'Suspended', params: { suspended: true } },
];

function roleLabel(role) {
  if (role === 'system_admin') return 'Admin';
  if (role === 'instructor') return 'Instructor';
  return 'Runner';
}

export default function AdminUsersScreen({ navigation, route }) {
  const initial = route?.params?.suspended ? 'SUSPENDED' : route?.params?.role === 'instructor' ? 'INSTRUCTORS' : 'ALL';
  const [filter, setFilter] = useState(initial);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    const result = await adminListUsersController({ ...active.params, search: search.trim() || undefined, limit: 50 });
    if (result.success) {
      setUsers(result.data.users || []);
      setTotal(result.data.pagination?.total ?? (result.data.users || []).length);
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <Header title="Users" navigation={navigation} />
      <FlatList
        data={users}
        keyExtractor={(item) => String(item.userId)}
        contentContainerStyle={adminStyles.content}
        ListHeaderComponent={
          <>
            <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name or email" autoCapitalize="none" />
            <View style={s.chips}>
              {FILTERS.map((f) => (
                <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>{f.label}</Chip>
              ))}
            </View>
            <ErrorText>{error}</ErrorText>
            {!loading && <Text style={s.count}>{total} account{total === 1 ? '' : 's'}</Text>}
          </>
        }
        renderItem={({ item }) => (
          <ListCard
            title={item.name}
            subtitle={`${item.email} · ${roleLabel(item.role)}`}
            onPress={() => navigation.navigate('AdminUserDetails', { userId: item.userId })}
            leading={
              item.isSuspended ? <Pill tone="bad">Susp</Pill>
                : item.role === 'instructor' && !item.credentialsVerified ? <Pill tone="warn">Pend</Pill>
                : item.role === 'system_admin' ? <Pill tone="good">Admin</Pill>
                : <Pill tone="neutral">{roleLabel(item.role).slice(0, 4)}</Pill>
            }
          />
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty>No accounts match this filter.</Empty>}
        ListFooterComponent={
          <Button style={s.create} variant="secondary" onPress={() => navigation.navigate('AdminCreateUser')}>
            Create Account
          </Button>
        }
      />
      <AdminNav navigation={navigation} active="Users" />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  count: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.md },
  create: { marginTop: spacing.md },
});
