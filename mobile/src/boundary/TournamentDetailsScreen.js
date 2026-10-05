import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import viewTournamentDetailsController from '../control/ViewTournamentDetailsController.js';
import viewTournamentStandingsController from '../control/ViewTournamentStandingsController.js';
import joinTournamentController from '../control/JoinTournamentController.js';
import withdrawFromTournamentController from '../control/WithdrawFromTournamentController.js';
import shareTournamentResultController from '../control/ShareTournamentResultController.js';
import { useAuth } from '../context/AuthContext.js';
import { Header, Screen } from '../components/AppUI.js';
import { formatDuration } from '../utils/geo.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, type } from '../theme/typography.js';

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatStatus(value) {
  return String(value || 'open').replaceAll('_', ' ').toUpperCase();
}

function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function TournamentDetailsScreen({ route, navigation }) {
  const tournamentId = route.params?.tournamentId;
  const isCreated = route.params?.isCreated === true;
  const { user } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const [detailsResult, standingsResult] = await Promise.all([
      viewTournamentDetailsController(tournamentId),
      viewTournamentStandingsController(tournamentId),
    ]);
    if (detailsResult.success) {
      setTournament(detailsResult.data.tournament);
      setParticipantCount(detailsResult.data.participantCount || 0);
      setIsGroupAdmin(!!detailsResult.data.isGroupAdmin);
      setIsParticipant(!!detailsResult.data.isParticipant);
    } else {
      Alert.alert('Could not load tournament', detailsResult.message);
    }
    if (standingsResult.success) setStandings(standingsResult.data.standings || []);
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleJoin() {
    setBusy(true);
    const result = await joinTournamentController(tournamentId);
    setBusy(false);
    if (result.success) {
      Alert.alert('Joined tournament', 'You are now registered for this tournament.');
      load();
    } else {
      Alert.alert('Could not join tournament', result.message);
    }
  }

  async function handleWithdraw() {
    Alert.alert('Withdraw from tournament', 'Are you sure you want to withdraw?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const result = await withdrawFromTournamentController(tournamentId);
          setBusy(false);
          if (result.success) {
            Alert.alert('Withdrawn', 'You have withdrawn from the tournament.');
            load();
          } else {
            Alert.alert('Could not withdraw', result.message);
          }
        },
      },
    ]);
  }

  async function handleShare() {
    const myStanding = standings.find((item) => item.user_id === user?.userId);
    await shareTournamentResultController(tournament, myStanding?.rank);
  }

  if (loading && !tournament) {
    return (
      <Screen>
        <Header title="Tournament Details" navigation={navigation} />
        <Text style={styles.loading}>Loading tournament…</Text>
      </Screen>
    );
  }

  if (!tournament) {
    return (
      <Screen>
        <Header title="Tournament Details" navigation={navigation} />
        <Text style={styles.loading}>Tournament could not be loaded.</Text>
      </Screen>
    );
  }

  const capacity = tournament.maxParticipants
    ? `${participantCount} / ${tournament.maxParticipants}`
    : String(participantCount);

  return (
    <Screen>
      <Header title="Tournament Details" navigation={navigation} />
      <FlatList
        data={standings}
        keyExtractor={(item, index) => String(item.user_id ?? item.userId ?? index)}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{formatStatus(tournament.status)}</Text>
                </View>
                <Text style={styles.groupText}>GROUP TOURNAMENT</Text>
              </View>
              <Text style={styles.name}>{tournament.name}</Text>
              <Text style={styles.description}>{tournament.description || 'No description has been added yet.'}</Text>
            </View>

            <Text style={styles.sectionTitle}>Tournament information</Text>
            <View style={styles.infoGrid}>
              <InfoItem label="Distance" value={tournament.distanceType || 'Not set'} />
              <InfoItem label="Participants" value={capacity} />
              <InfoItem label="Starts" value={formatDate(tournament.startDate)} />
              <InfoItem label="Registration closes" value={formatDate(tournament.registrationDeadline)} />
            </View>

            {isCreated ? (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Organizer tools</Text>
                <Text style={styles.actionCopy}>Update tournament details, participant limits, registration deadline, status, or delete the tournament.</Text>
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={() => navigation.navigate('TournamentManagement', { tournamentId, tournament })}
                >
                  <Text style={styles.primaryButtonText}>Manage Tournament</Text>
                </Pressable>
              </View>
            ) : tournament.status === 'open' ? (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Registration</Text>
                <Text style={styles.actionCopy}>Join this tournament to take part, or withdraw if you are already registered.</Text>
                <View style={styles.actionRow}>
                  <Pressable disabled={busy} style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.pressed, busy && styles.disabled]} onPress={handleJoin}>
                    <Text style={styles.primaryButtonText}>Join Tournament</Text>
                  </Pressable>
                  <Pressable disabled={busy} style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.pressed, busy && styles.disabled]} onPress={handleWithdraw}>
                    <Text style={styles.secondaryButtonText}>Withdraw</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Registration closed</Text>
                <Text style={styles.actionCopy}>This tournament is currently {String(tournament.status).replaceAll('_', ' ')}.</Text>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Standings</Text>
              <Pressable onPress={handleShare} hitSlop={10}>
                <Text style={styles.shareText}>Share result</Text>
              </Pressable>
            </View>

            {/* Finishing times are what the ranking works from, so anyone who may record
                one needs a way in once the tournament is under way. */}
            {tournament.status !== 'open' && (isGroupAdmin || isParticipant) && (
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, styles.recordButton, pressed && styles.pressed]}
                onPress={() => navigation.navigate('TournamentResults', {
                  tournamentId,
                  isGroupAdmin,
                  status: tournament.status,
                })}
              >
                <Text style={styles.secondaryButtonText}>
                  {isGroupAdmin ? 'Record Results' : 'Record My Time'}
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.standingRow}>
            <View style={styles.rankCircle}><Text style={styles.rankText}>{item.rank || index + 1}</Text></View>
            <View style={styles.standingCopy}>
              <Text style={styles.standingName}>{item.name || 'Runner'}</Text>
              <Text style={styles.standingSub}>{item.result_time_seconds ? 'Result recorded' : 'Waiting for result'}</Text>
            </View>
            <Text style={styles.standingTime}>
              {item.result_time_seconds ? formatDuration(Number(item.result_time_seconds)) : '—'}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No standings yet</Text>
            <Text style={styles.emptyCopy}>Results will appear here after tournament times are submitted.</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 56 },
  heroCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, marginTop: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  statusPill: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 9.5, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.5 },
  groupText: { fontSize: 9.5, fontWeight: '700', color: colors.inkFaint, letterSpacing: 0.5 },
  name: { fontSize: 25, lineHeight: 31, fontWeight: '700', color: colors.ink },
  description: { fontSize: 12.5, lineHeight: 18, color: colors.inkMuted, marginTop: 9 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 24, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '48.5%', minHeight: 78, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 13 },
  infoLabel: { fontSize: 9.5, fontWeight: '700', color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.ink, marginTop: 8 },
  actionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginTop: 20 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  actionCopy: { fontSize: 11.5, lineHeight: 17, color: colors.inkMuted, marginTop: 6, marginBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { ...type.bodyStrong, color: colors.onPrimary },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { ...type.bodyStrong, color: colors.ink },
  flexButton: { flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  shareText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  recordButton: { marginBottom: 14 },
  standingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 13, marginBottom: 10 },
  rankCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  standingCopy: { flex: 1, marginLeft: 12 },
  standingName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  standingSub: { fontSize: 10.5, color: colors.inkMuted, marginTop: 4 },
  standingTime: { fontSize: 12, fontWeight: '700', color: colors.ink },
  emptyCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 18, marginBottom: 20 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  emptyCopy: { fontSize: 11.5, lineHeight: 17, color: colors.inkMuted, marginTop: 6 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
