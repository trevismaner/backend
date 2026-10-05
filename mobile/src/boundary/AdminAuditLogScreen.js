import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import adminViewAuditLogsController from '../control/AdminViewAuditLogsController.js';
import { Screen, Header, Chip, Card } from '../components/AppUI.js';
import { Loading, Empty, ErrorText, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const FILTERS = [
  { key: 'ALL', label: 'All', params: {} },
  { key: 'USER', label: 'Users', params: { targetType: 'user' } },
  { key: 'GROUP', label: 'Groups', params: { targetType: 'group' } },
  { key: 'REWARD', label: 'Rewards', params: { targetType: 'reward' } },
  { key: 'BADGE', label: 'Badges', params: { targetType: 'badge' } },
];

function readable(action) {
  if (!action) return 'Action';
  const words = String(action).replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function when(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function detailLines(details) {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
}

export default function AdminAuditLogScreen({ navigation }) {
  const [filter, setFilter] = useState('ALL');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    const result = await adminViewAuditLogsController({ ...active.params, limit: 50 });
    if (result.success) {
      setLogs(result.data.logs || []);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  return (
    <Screen>
      <Header title="Audit Log" navigation={navigation} />
      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.logId)}
        contentContainerStyle={adminStyles.content}
        ListHeaderComponent={
          <>
            <View style={s.chips}>
              {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>{f.label}</Chip>)}
            </View>
            <ErrorText>{error}</ErrorText>
          </>
        }
        renderItem={({ item }) => (
          <Card style={s.card}>
            <View style={s.top}>
              <Text style={s.action}>{readable(item.action)}</Text>
              <Text style={s.time}>{when(item.createdAt)}</Text>
            </View>
            <Text style={s.by}>
              by {item.adminName || `admin #${item.adminId}`}
              {item.targetType ? ` · ${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}` : ''}
            </Text>
            {detailLines(item.details).map((line) => (
              <Text key={line} style={s.detail}>{line}</Text>
            ))}
          </Card>
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty>No admin actions recorded yet.</Empty>}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  card: { padding: 14, marginBottom: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  action: { ...type.bodyStrong, color: colors.ink, flex: 1 },
  time: { ...type.caption, color: colors.inkFaint },
  by: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  detail: { ...type.caption, color: colors.inkFaint, marginTop: 4 },
});
