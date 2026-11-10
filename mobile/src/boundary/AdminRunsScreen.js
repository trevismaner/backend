import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import adminListRunsController from '../control/AdminListRunsController.js';
import adminDeleteRunController from '../control/AdminDeleteRunController.js';
import { Screen, Header, Chip, Card } from '../components/AppUI.js';
import { Pill, Confirm, Loading, Empty, ErrorText, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const FILTERS = [
  { key: 'ALL', label: 'All runs', params: {} },
  { key: 'SUSPICIOUS', label: 'Impossible pace', params: { maxPaceSecondsPerKm: 180 } },
  { key: 'LONG', label: 'Over 30 km', params: { minDistanceKm: 30 } },
];

function pace(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${m}:${rest}/km`;
}

function duration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminRunsScreen({ navigation, route }) {
  const [filter, setFilter] = useState('ALL');
  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const userId = route?.params?.userId;

  const load = useCallback(async () => {
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    const result = await adminListRunsController({ ...active.params, userId, limit: 50 });
    if (result.success) {
      setRuns(result.data.runs || []);
      setTotal(result.data.pagination?.total ?? (result.data.runs || []).length);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [filter, userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  function askDelete(run) {
    setConfirm({
      title: 'Delete this run?',
      message: `${run.name || 'Untitled run'} — ${Number(run.distanceKm).toFixed(2)} km by ${run.userName}. Deleting it may change their badges and leaderboard position.`,
      run: async () => {
        setBusy(true);
        const result = await adminDeleteRunController(run.runId);
        setBusy(false);
        setConfirm(null);
        if (result.success) await load();
        else setError(result.message);
      },
    });
  }

  return (
    <Screen>
      <Header title={userId ? 'Runs for account' : 'Runs'} navigation={navigation} />
      <FlatList
        data={runs}
        keyExtractor={(item) => String(item.runId)}
        contentContainerStyle={adminStyles.content}
        ListHeaderComponent={
          <>
            <View style={s.chips}>
              {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>{f.label}</Chip>)}
            </View>
            <ErrorText>{error}</ErrorText>
            {!loading && <Text style={s.count}>{total} run{total === 1 ? '' : 's'}</Text>}
            {filter === 'SUSPICIOUS' && <Text style={s.note}>Showing runs faster than 3:00/km — usually a GPS glitch or a manual entry mistake.</Text>}
          </>
        }
        renderItem={({ item }) => (
          <Card style={s.card}>
            <View style={s.cardTop}>
              <View style={s.cardCopy}>
                <Text numberOfLines={1} style={s.cardTitle}>{item.name || 'Untitled run'}</Text>
                <Text style={s.cardMeta}>{item.userName} · {item.userEmail}</Text>
              </View>
              {item.paceSecondsPerKm != null && item.paceSecondsPerKm < 180 && <Pill tone="bad">Check</Pill>}
            </View>
            <View style={s.stats}>
              <Text style={s.stat}>{Number(item.distanceKm ?? 0).toFixed(2)} km</Text>
              <Text style={s.stat}>{duration(item.durationSeconds)}</Text>
              <Text style={s.stat}>{pace(item.paceSecondsPerKm)}</Text>
              <Text style={s.stat}>{item.startedAt ? new Date(item.startedAt).toLocaleDateString() : '—'}</Text>
            </View>
            <Pressable disabled={busy} onPress={() => askDelete(item)} style={({ pressed }) => [s.action, pressed && s.pressed]}>
              <Text style={s.actionText}>Delete run</Text>
            </Pressable>
          </Card>
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty>No runs match this filter.</Empty>}
      />
      <Confirm
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Delete run"
        busy={busy}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  count: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.sm },
  note: { ...type.caption, color: colors.riskModerate, marginBottom: spacing.md, lineHeight: 17 },
  card: { padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  stat: { ...type.caption, color: colors.ink },
  action: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.riskHigh, backgroundColor: colors.riskHighBg, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  actionText: { ...type.caption, fontWeight: '600', color: colors.riskHigh },
  pressed: { opacity: 0.72 },
});
