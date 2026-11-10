import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import viewTournamentStandingsController from '../control/ViewTournamentStandingsController.js';
import recordTournamentResultController from '../control/RecordTournamentResultController.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { Confirm, Loading, ErrorText } from '../components/AdminUI.js';
import { formatDuration } from '../utils/geo.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

/**
 * Records finishing times, which is what gives the standings something to rank.
 *
 * A group admin can record for any participant; everyone else can record only their own.
 * Times are entered as h:mm:ss, mm:ss, or a plain number of minutes.
 */
export default function TournamentResultsScreen({ navigation, route }) {
  const { tournamentId, isGroupAdmin = false, status } = route.params ?? {};
  const { user } = useAuth();

  const [standings, setStandings] = useState([]);
  const [editing, setEditing] = useState(null);   // the row being edited
  const [time, setTime] = useState('');
  const [confirmClear, setConfirmClear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const result = await viewTournamentStandingsController(tournamentId);
    if (result.success) { setStandings(result.data.standings || []); setError(''); }
    else setError(result.message);
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canEdit = (row) => isGroupAdmin || String(row.user_id) === String(user?.userId);

  function startEdit(row) {
    setEditing(row);
    setTime(row.result_time_seconds ? formatDuration(Number(row.result_time_seconds)) : '');
    setError('');
    setNotice('');
  }

  async function save() {
    setBusy(true); setError(''); setNotice('');
    const result = await recordTournamentResultController({
      tournamentId,
      userId: editing.user_id,
      time,
    });
    setBusy(false);
    if (result.success) {
      setStandings(result.data.standings || []);
      setNotice(`Recorded for ${editing.name}`);
      setEditing(null);
    } else setError(result.message);
  }

  async function clearResult() {
    setBusy(true); setError('');
    const result = await recordTournamentResultController({
      tournamentId,
      userId: confirmClear.user_id,
      clear: true,
    });
    setBusy(false);
    setConfirmClear(null);
    if (result.success) { setStandings(result.data.standings || []); setNotice('Result cleared'); }
    else setError(result.message);
  }

  if (loading) {
    return <Screen><Header title="Record Results" navigation={navigation} /><Loading /></Screen>;
  }

  return (
    <Screen>
      <Header title="Record Results" navigation={navigation} />

      {editing ? (
        <View style={s.editPane}>
          <Text style={s.editName}>{editing.name}</Text>
          <Text style={s.editHint}>Enter the finishing time as 1:25:12, 25:12, or just the minutes.</Text>
          <Field label="Finishing time" value={time} onChangeText={setTime} placeholder="1:25:12" autoCapitalize="none" />
          <ErrorText>{error}</ErrorText>
          <Button onPress={save} disabled={busy || !time.trim()}>{busy ? 'Saving…' : 'Save Result'}</Button>
          <Button variant="secondary" style={s.gap} onPress={() => { setEditing(null); setError(''); }} disabled={busy}>
            Cancel
          </Button>
        </View>
      ) : (
        <FlatList
          data={standings}
          keyExtractor={(item, i) => String(item.user_id ?? i)}
          contentContainerStyle={s.page}
          ListHeaderComponent={
            <View>
              <Text style={s.intro}>
                {isGroupAdmin
                  ? 'Record a time for any participant. Completing the tournament ranks everyone who has one.'
                  : 'Record your own finishing time. Only a group admin can record for others.'}
              </Text>
              {status === 'open' && (
                <Text style={s.warn}>This tournament has not started yet, so results cannot be recorded.</Text>
              )}
              {!!notice && <Text style={s.notice}>{notice}</Text>}
              <ErrorText>{error}</ErrorText>
            </View>
          }
          renderItem={({ item }) => {
            const editable = canEdit(item) && status !== 'open';
            return (
              <View style={s.row}>
                <View style={s.rank}><Text style={s.rankText}>{item.rank ?? '–'}</Text></View>
                <View style={s.rowCopy}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowTime}>
                    {item.result_time_seconds
                      ? formatDuration(Number(item.result_time_seconds))
                      : 'No time recorded'}
                  </Text>
                </View>
                {editable && (
                  <View style={s.rowActions}>
                    <Pressable onPress={() => startEdit(item)} hitSlop={8} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                      <Text style={s.actionText}>{item.result_time_seconds ? 'Edit' : 'Record'}</Text>
                    </Pressable>
                    {!!item.result_time_seconds && (
                      <Pressable onPress={() => setConfirmClear(item)} hitSlop={8} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                        <Text style={[s.actionText, s.clearText]}>Clear</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>Nobody has joined this tournament yet.</Text>}
        />
      )}

      <Confirm
        visible={!!confirmClear}
        title="Clear this result?"
        message={`${confirmClear?.name}'s time will be removed and the standings re-ranked.`}
        confirmLabel="Clear"
        destructive
        busy={busy}
        onCancel={() => setConfirmClear(null)}
        onConfirm={clearResult}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  intro: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.md, lineHeight: 17 },
  warn: { ...type.caption, color: colors.riskModerate, marginBottom: spacing.md, lineHeight: 17 },
  notice: { ...type.caption, color: colors.riskLow, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 15, paddingHorizontal: 13, marginBottom: 10 },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  rankText: { ...type.caption, fontWeight: '700', color: colors.ink },
  rowCopy: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowTime: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 10 },
  action: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  actionText: { ...type.caption, fontWeight: '600', color: colors.primary },
  clearText: { color: colors.inkMuted },
  pressed: { opacity: 0.6 },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: 40 },
  editPane: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  editName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  editHint: { ...type.caption, color: colors.inkMuted, marginTop: 6, marginBottom: spacing.lg, lineHeight: 17 },
  gap: { marginTop: spacing.sm },
});
