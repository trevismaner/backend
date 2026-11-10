import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext.js';
import viewRunHistoryController from '../control/ViewRunHistoryController.js';
import viewRiskScoreController from '../control/ViewRiskScoreController.js';
import viewNotificationsController from '../control/ViewNotificationsController.js';
import { Screen, Brand, FeatureCard, BottomNav, Card } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const LEVEL = {
  low: ['LOW RISK', colors.riskLow],
  moderate: ['MODERATE RISK', colors.riskModerate],
  high: ['HIGH RISK', colors.riskHigh],
};

/** Monday 00:00 of the week the given date falls in. */
function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // getDay(): 0 = Sunday
  return start;
}

function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [risk, setRisk] = useState(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Everything on this screen is live data, so it reloads whenever the tab comes into view —
  // logging a run and coming back must change the numbers immediately.
  const load = useCallback(async () => {
    const [history, riskResult, notes] = await Promise.all([
      // Runs come back newest-first, so 100 always covers the current week.
      viewRunHistoryController({ limit: 100 }),
      viewRiskScoreController(),
      viewNotificationsController(),
    ]);

    if (history.success) setRuns(history.data.runs || []);
    // A missing or failed risk assessment is not an error here — the card just prompts for one.
    setRisk(riskResult.success ? riskResult.data : null);
    if (notes.success) {
      const list = notes.data.notifications ?? notes.data ?? [];
      setUnread(list.filter((n) => !(n.isRead ?? n.is_read)).length);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The real week: each run this user logged since Monday, bucketed by day.
  const weekly = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now);
    const values = Array(7).fill(0);

    for (const run of runs) {
      const startedAt = new Date(run.startedAt ?? run.started_at);
      if (Number.isNaN(startedAt.getTime()) || startedAt < start) continue;
      const day = Math.floor((startedAt - start) / 86400000);
      if (day < 0 || day > 6) continue; // a future-dated run belongs to another week
      values[day] += Number(run.distanceKm ?? run.distance_km ?? 0);
    }

    return {
      values,
      total: values.reduce((a, b) => a + b, 0),
      todayIndex: (now.getDay() + 6) % 7,
    };
  }, [runs]);

  const max = Math.max(...weekly.values, 1);
  const hasRuns = weekly.total > 0;
  const first = user?.name?.split(' ')[0] || 'Runner';

  const score = risk?.score ?? null;
  const [levelText, levelColour] = score ? (LEVEL[score.riskLevel] ?? LEVEL.low) : [null, colors.inkMuted];

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={s.top}>
          <Brand />
          <Pressable
            style={s.inbox}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={s.mail}>✉</Text>
            {unread > 0 && <View style={s.dot} />}
          </Pressable>
        </View>

        <Text style={s.greeting}>{greetingFor(new Date().getHours())}, {first}</Text>
        <Text style={s.tag}>A stronger you is a few steps away.</Text>

        <View style={s.grid}>
          <FeatureCard title="Group" subtitle="Run together, go further." onPress={() => navigation.navigate('GroupsHub')} />
          <FeatureCard title="Tournament" subtitle="Compete and climb the ranks." onPress={() => navigation.navigate('TournamentHub')} />
          <FeatureCard title="Fitness Plan" subtitle="Tailored plans for your goals." onPress={() => navigation.navigate('FitnessPlan')} />
          <FeatureCard title="Instructor Board" subtitle="Learn from expert runners." onPress={() => navigation.navigate('InstructorBoard')} />
        </View>

        <Card style={s.week}>
          <View style={s.weekHead}>
            <Text style={s.weekTitle}>This Week</Text>
            <View>
              <Text style={s.total}>{weekly.total.toFixed(1)} km</Text>
              <Text style={s.totalLabel}>Total Distance</Text>
            </View>
          </View>

          <View style={s.chart}>
            {weekly.values.map((km, i) => (
              <View key={i} style={s.column}>
                <View
                  style={[
                    s.bar,
                    { height: km > 0 ? 4 + (km / max) * 62 : 4 },
                    i === weekly.todayIndex && km > 0 && s.today,
                  ]}
                />
                <Text style={[s.dayLabel, i === weekly.todayIndex && s.dayLabelToday]}>{DAY_LABELS[i]}</Text>
              </View>
            ))}
          </View>

          {!hasRuns && <Text style={s.empty}>No runs logged yet this week.</Text>}
        </Card>

        <Pressable style={s.risk} onPress={() => navigation.navigate('RiskAssessment')}>
          <Text style={s.riskTitle}>Risk Assessment</Text>
          {score ? (
            <>
              <Text style={[s.riskScore, { color: levelColour }]}>{Math.round(score.finalScore)} · {levelText}</Text>
              <Text style={s.riskSub}>View contributing data or update your assessment</Text>
            </>
          ) : (
            <>
              <Text style={[s.riskScore, s.riskScoreNone]}>Not assessed yet</Text>
              <Text style={s.riskSub}>Fill in the health form to get your score</Text>
            </>
          )}
          <Text style={s.riskChev}>›</Text>
        </Pressable>

        <Pressable style={s.run} onPress={() => navigation.navigate('LogRun')}>
          <Text style={s.runText}>Start a Run</Text>
        </Pressable>
      </ScrollView>
      <BottomNav navigation={navigation} active="Home" />
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 82 },
  top: { height: 72, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  inbox: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  mail: { fontSize: 20, color: colors.ink },
  dot: { position: 'absolute', right: 7, top: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  greeting: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, color: colors.ink, marginTop: 8 },
  tag: { fontSize: 13, color: colors.inkMuted, marginTop: 5, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  week: { minHeight: 176, marginTop: 11, padding: 16, backgroundColor: colors.surface },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between' },
  weekTitle: { fontSize: 21, fontWeight: '700', color: colors.ink },
  total: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'right' },
  totalLabel: { fontSize: 11, color: colors.inkMuted, marginTop: 2, textAlign: 'right' },
  chart: { height: 92, marginTop: 8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 10 },
  column: { alignItems: 'center' },
  bar: { width: 18, borderRadius: 5, backgroundColor: colors.white75 },
  today: { backgroundColor: colors.primary },
  dayLabel: { fontSize: 10, color: colors.inkMuted, marginTop: 6 },
  dayLabelToday: { color: colors.ink, fontWeight: '700' },
  empty: { fontSize: 11.5, color: colors.inkMuted, textAlign: 'center', marginTop: 2 },
  risk: { minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, marginTop: 22, padding: 15 },
  riskTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  riskScore: { fontSize: 22, fontWeight: '600', color: colors.riskLow, marginTop: 5 },
  riskScoreNone: { fontSize: 18, color: colors.inkMuted },
  riskSub: { fontSize: 10.5, color: colors.inkMuted, marginTop: 6 },
  riskChev: { position: 'absolute', right: 16, top: 34, fontSize: 24, color: colors.inkMuted },
  run: { height: 72, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 24, borderWidth: 1, borderColor: colors.border },
  runText: { fontSize: 23, fontWeight: '700', color: colors.ink },
});
