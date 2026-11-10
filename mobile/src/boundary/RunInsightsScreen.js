import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import viewRunInsightsController from '../control/ViewRunInsightsController.js';
import { Screen, Header, Card } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const TITLES = {
  calories: ['Calories', 'Estimated energy burn'],
  'heart-rate': ['Heart Rate', 'Average and maximum across your runs'],
  trends: ['Performance Trends', 'Distance, pace and training load'],
};

function pace(seconds) {
  if (seconds == null) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}/km`;
}

function Delta({ percent, goodDown = false }) {
  if (percent === null || percent === undefined) {
    return <Text style={s.deltaFlat}>no earlier data to compare</Text>;
  }
  const improving = goodDown ? percent < 0 : percent > 0;
  const flat = percent === 0;
  return (
    <Text style={[s.delta, flat ? s.deltaFlat : improving ? s.deltaUp : s.deltaDown]}>
      {percent > 0 ? '+' : ''}{percent}%{flat ? ' no change' : ''}
    </Text>
  );
}

function Row({ label, value, hint }) {
  return (
    <View style={s.row}>
      <View style={s.rowCopy}>
        <Text style={s.rowLabel}>{label}</Text>
        {!!hint && <Text style={s.rowHint}>{hint}</Text>}
      </View>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function TrendBlock({ title, window: w, subtitle }) {
  return (
    <Card style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardSub}>{subtitle}</Text>

      <View style={s.trendRow}>
        <View style={s.trendCell}>
          <Text style={s.trendValue}>{w.current.distanceKm.toFixed(1)} km</Text>
          <Text style={s.trendLabel}>distance</Text>
          <Delta percent={w.change.distancePercent} />
        </View>
        <View style={s.trendCell}>
          <Text style={s.trendValue}>{pace(w.current.avgPaceSecondsPerKm)}</Text>
          <Text style={s.trendLabel}>avg pace</Text>
          <Delta percent={w.change.pacePercent} goodDown />
        </View>
        <View style={s.trendCell}>
          <Text style={s.trendValue}>{w.current.runCount}</Text>
          <Text style={s.trendLabel}>runs</Text>
          <Delta percent={w.change.runCountPercent} />
        </View>
      </View>

      <Text style={s.compare}>
        Previous period: {w.previous.distanceKm.toFixed(1)} km over {w.previous.runCount} run
        {w.previous.runCount === 1 ? '' : 's'}
        {w.previous.avgPaceSecondsPerKm ? ` at ${pace(w.previous.avgPaceSecondsPerKm)}` : ''}
      </Text>
    </Card>
  );
}

export default function RunInsightsScreen({ navigation, route }) {
  const kind = route.params?.kind || 'trends';
  const [title, subtitle] = TITLES[kind] || TITLES.trends;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const result = await viewRunInsightsController();
      if (result.success) { setData(result.data); setError(''); }
      else setError(result.message);
      setLoading(false);
    })();
  }, []);

  function body() {
    if (loading) return <Text style={s.muted}>Loading your runs…</Text>;
    if (error) return <Text style={s.error}>{error}</Text>;
    if (!data) return null;

    if (kind === 'calories') {
      const c = data.calories;
      if (!c.runsWithData) {
        return <Text style={s.muted}>None of your runs have calorie data yet. Log a run with a wearable connected, or enter it by hand.</Text>;
      }
      return (
        <>
          <Card style={s.hero}>
            <Text style={s.heroValue}>{c.totalCalories.toLocaleString()}</Text>
            <Text style={s.heroLabel}>kcal burned across {c.runsWithData} run{c.runsWithData === 1 ? '' : 's'}</Text>
          </Card>
          <Card style={s.card}>
            <Row label="Average per run" value={`${c.avgPerRun} kcal`} />
            <Row label="Average per km" value={`${c.avgPerKm} kcal`} hint="Useful for comparing efforts of different lengths" />
          </Card>
        </>
      );
    }

    if (kind === 'heart-rate') {
      const h = data.heartRate;
      if (!h.runsWithData) {
        return <Text style={s.muted}>None of your runs have heart-rate data yet. Connect a wearable to see this.</Text>;
      }
      return (
        <>
          <Card style={s.hero}>
            <Text style={s.heroValue}>{h.avgHeartRate} bpm</Text>
            <Text style={s.heroLabel}>average across {h.runsWithData} run{h.runsWithData === 1 ? '' : 's'}</Text>
          </Card>
          <Card style={s.card}>
            <Row label="Highest recorded" value={`${h.maxHeartRate} bpm`} hint="Peak across all your runs" />
            <Row label="Lowest run average" value={`${h.lowestAvgHeartRate} bpm`} hint="Usually your easiest run" />
          </Card>
        </>
      );
    }

    const t = data.trends;
    if (!t.shortTerm.current.runCount && !t.longTerm.current.runCount) {
      return <Text style={s.muted}>Not enough runs yet to show a trend. Log a few and check back.</Text>;
    }
    return (
      <>
        <TrendBlock title="Short term" subtitle="Last 7 days vs the 7 before" window={t.shortTerm} />
        <TrendBlock title="Long term" subtitle="Last 30 days vs the 30 before" window={t.longTerm} />
        <Text style={s.note}>
          A falling pace percentage means you are getting faster. Large jumps in distance are
          worth easing off on — see your risk assessment.
        </Text>
      </>
    );
  }

  return (
    <Screen>
      <Header title={title} navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.sub}>{subtitle}</Text>
        {body()}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  sub: { ...type.body, color: colors.inkMuted, marginBottom: spacing.lg },
  hero: { padding: 24, marginBottom: 12 },
  heroValue: { fontSize: 36, fontWeight: '700', color: colors.ink },
  heroLabel: { ...type.caption, color: colors.inkMuted, marginTop: 6 },
  card: { padding: 16, marginBottom: 12 },
  cardTitle: { ...type.subtitle, color: colors.ink },
  cardSub: { ...type.caption, color: colors.inkFaint, marginTop: 4, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rowCopy: { flex: 1 },
  rowLabel: { ...type.body, color: colors.ink },
  rowHint: { ...type.caption, color: colors.inkFaint, marginTop: 3 },
  rowValue: { ...type.bodyStrong, color: colors.ink },
  trendRow: { flexDirection: 'row', gap: 10 },
  trendCell: { flex: 1 },
  trendValue: { fontSize: 19, fontWeight: '700', color: colors.ink },
  trendLabel: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  delta: { ...type.caption, fontWeight: '600', marginTop: 6 },
  deltaUp: { color: colors.success },
  deltaDown: { color: colors.riskModerate },
  deltaFlat: { ...type.caption, color: colors.inkFaint, marginTop: 6 },
  compare: { ...type.caption, color: colors.inkFaint, marginTop: spacing.md, lineHeight: 17 },
  note: { ...type.caption, color: colors.inkFaint, marginTop: spacing.md, lineHeight: 17 },
  muted: { ...type.body, color: colors.inkMuted, lineHeight: 20 },
  error: { ...type.body, color: colors.riskHigh },
});
