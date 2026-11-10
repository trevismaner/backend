import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { GOAL_TYPES, GOAL_LABELS } from '../entities/FitnessPlan.js';
import viewFitnessPlanController from '../control/ViewFitnessPlanController.js';
import createFitnessPlanController from '../control/CreateFitnessPlanController.js';
import updateFitnessPlanController from '../control/UpdateFitnessPlanController.js';
import deleteFitnessPlanController from '../control/DeleteFitnessPlanController.js';
import activateFitnessPlanController from '../control/ActivateFitnessPlanController.js';
import generateFitnessPlanController from '../control/GenerateFitnessPlanController.js';
import { completePlanSessionController, clearPlanSessionController } from '../control/CompletePlanSessionController.js';
import viewRunHistoryController from '../control/ViewRunHistoryController.js';
import { Screen, Header, Card, Field, Button, Chip, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const goalLabel = (g) => GOAL_LABELS[g] ?? g;

// 1 = Monday, matching the ISO weekday the schedule stores and the Monday-start week the
// dashboard already uses.
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SESSION_LABELS = {
  easy: 'Easy run',
  long: 'Long run',
  tempo: 'Tempo',
  intervals: 'Intervals',
  recovery: 'Recovery run',
  cross_training: 'Cross training',
  rest: 'Rest',
};

export default function FitnessPlanScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState(null);
  const [pastPlans, setPastPlans] = useState([]);
  const [goalTypes, setGoalTypes] = useState(GOAL_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'create' | 'edit'
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The generated schedule (migration 007). A plan may have none — every plan made before
  // the feature existed has none, and so does one whose generation failed.
  const [schedule, setSchedule] = useState([]);
  const [scheduleProgress, setScheduleProgress] = useState(null);
  const [usesAi, setUsesAi] = useState(false);
  const [openWeek, setOpenWeek] = useState(1);
  const [picking, setPicking] = useState(null); // the session being matched to a run
  const [recentRuns, setRecentRuns] = useState([]);

  const [goalType, setGoalType] = useState('general_fitness');
  const [distance, setDistance] = useState('');
  const [frequency, setFrequency] = useState('');
  const [weeks, setWeeks] = useState('');

  /** Returns the loaded plan, so the generation poll can see when the status changes. */
  const load = useCallback(async () => {
    const result = await viewFitnessPlanController();
    let loaded = null;

    if (result.success) {
      loaded = result.data.plan;
      setPlan(result.data.plan);
      setProgress(result.data.progress);
      setPastPlans(result.data.pastPlans || []);
      setSchedule(result.data.schedule || []);
      setScheduleProgress(result.data.scheduleProgress || null);
      setUsesAi(!!result.data.planGenerationUsesAi);
      if (result.data.goalTypes) setGoalTypes(result.data.goalTypes);
      setError('');
    } else {
      setError(result.message);
    }

    // Always, on both paths: returning early from the success branch left the screen on its
    // loading spinner for ever, which looked like the plan failing to load.
    setLoading(false);
    return loaded;
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Asks the server to build a schedule, then polls until it is done.
   *
   * Generation happens away from the request because it may call a language model, so there
   * is nothing to await — generationStatus is what says when it is ready. Polling gives up
   * after about 40 seconds rather than spinning for ever if something upstream went quiet.
   */
  async function handleGenerate() {
    setBusy(true);
    setError('');
    const started = await generateFitnessPlanController(plan.planId);
    if (!started.success) {
      setBusy(false);
      setError(started.message);
      return;
    }

    setPlan((current) => ({ ...current, generationStatus: 'generating' }));

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((done) => setTimeout(done, 1000));
      const latest = await load();
      if (latest && latest.generationStatus !== 'generating') break;
    }
    setBusy(false);
  }

  /** Opens the recent runs, to match one against a planned session. */
  async function openRunPicker(session) {
    setPicking(session);
    const result = await viewRunHistoryController({ limit: 20 });
    setRecentRuns(result.success ? result.data.runs || [] : []);
  }

  async function matchRun(runId) {
    const session = picking;
    setPicking(null);
    if (!session) return;
    const result = await completePlanSessionController(session.sessionId, runId);
    if (!result.success) setError(result.message);
    await load();
  }

  async function unmatchSession(session) {
    const result = await clearPlanSessionController(session.sessionId);
    if (!result.success) setError(result.message);
    await load();
  }

  function openCreate() {
    setGoalType('general_fitness');
    setDistance('');
    setFrequency('');
    setWeeks('');
    setError('');
    setMode('create');
  }

  function openEdit() {
    setGoalType(plan.goalType);
    setDistance(plan.targetDistanceKm != null ? String(plan.targetDistanceKm) : '');
    setFrequency(plan.weeklyFrequency != null ? String(plan.weeklyFrequency) : '');
    setWeeks(plan.durationWeeks != null ? String(plan.durationWeeks) : '');
    setError('');
    setMode('edit');
  }

  const numOrNull = (v) => (v.trim() === '' ? null : Number(v));

  async function save() {
    setBusy(true);
    setError('');
    const fields = {
      goalType,
      targetDistanceKm: numOrNull(distance),
      weeklyFrequency: numOrNull(frequency),
      durationWeeks: numOrNull(weeks),
    };
    const result = mode === 'create'
      ? await createFitnessPlanController(fields)
      : await updateFitnessPlanController({ planId: plan.planId, changes: fields });
    setBusy(false);
    if (result.success) { setMode(null); await load(); }
    else setError(result.message);
  }

  async function remove() {
    setBusy(true);
    const result = await deleteFitnessPlanController(plan.planId);
    setBusy(false);
    setConfirmDelete(false);
    if (result.success) await load();
    else setError(result.message);
  }

  async function reactivate(planId) {
    setBusy(true);
    const result = await activateFitnessPlanController(planId);
    setBusy(false);
    if (result.success) await load();
    else setError(result.message);
  }

  const editing = mode !== null;

  return (
    <Screen>
      <Header title="Fitness Plan" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        {!!error && <Text style={s.error}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={s.loading} />
        ) : editing ? (
          <>
            <Text style={s.formTitle}>{mode === 'create' ? 'New plan' : 'Edit plan'}</Text>

            <Text style={s.label}>Goal</Text>
            <View style={s.chips}>
              {goalTypes.map((g) => (
                <Chip key={g} active={goalType === g} onPress={() => setGoalType(g)}>{goalLabel(g)}</Chip>
              ))}
            </View>

            <Field label="Target distance (km)" value={distance} onChangeText={setDistance} placeholder="e.g. 10" keyboardType="decimal-pad" />
            <Field label="Runs per week" value={frequency} onChangeText={setFrequency} placeholder="e.g. 3" keyboardType="number-pad" />
            <Field label="Plan length (weeks)" value={weeks} onChangeText={setWeeks} placeholder="e.g. 12" keyboardType="number-pad" />
            <Text style={s.hint}>Leave a field blank to leave it unset.</Text>

            <Button style={s.gap} onPress={save} disabled={busy}>
              {busy ? 'Saving…' : mode === 'create' ? 'Create Plan' : 'Save Changes'}
            </Button>
            <Button variant="secondary" style={s.gap} onPress={() => setMode(null)} disabled={busy}>Cancel</Button>
          </>
        ) : plan ? (
          <>
            {}
            <Card style={s.hero}>
              <Text style={s.heroLabel}>ACTIVE PLAN</Text>
              <Text style={s.heroGoal}>{goalLabel(plan.goalType)}</Text>
              <View style={s.heroStats}>
                <View style={s.heroStat}>
                  <Text style={s.heroValue}>{plan.targetDistanceKm != null ? `${plan.targetDistanceKm} km` : '—'}</Text>
                  <Text style={s.heroCaption}>target</Text>
                </View>
                <View style={s.heroStat}>
                  <Text style={s.heroValue}>{plan.weeklyFrequency ?? '—'}</Text>
                  <Text style={s.heroCaption}>runs/week</Text>
                </View>
                <View style={s.heroStat}>
                  <Text style={s.heroValue}>{plan.durationWeeks ?? '—'}</Text>
                  <Text style={s.heroCaption}>weeks</Text>
                </View>
              </View>
            </Card>

            {progress && (
              <Card style={s.card}>
                <Text style={s.cardTitle}>This week</Text>
                <Text style={s.progressValue}>
                  {progress.runsThisWeek} run{progress.runsThisWeek === 1 ? '' : 's'} · {progress.distanceThisWeek} km
                </Text>
                {progress.weeklyFrequency != null && (
                  <>
                    <View style={s.bar}>
                      <View
                        style={[
                          s.barFill,
                          { width: `${Math.min(100, (progress.runsThisWeek / progress.weeklyFrequency) * 100)}%` },
                          progress.onTrack && s.barDone,
                        ]}
                      />
                    </View>
                    <Text style={s.progressHint}>
                      {progress.onTrack
                        ? `Target of ${progress.weeklyFrequency} met for this week.`
                        : `${progress.runsRemaining} more run${progress.runsRemaining === 1 ? '' : 's'} to hit ${progress.weeklyFrequency} this week.`}
                    </Text>
                  </>
                )}
              </Card>
            )}

            {/* The generated schedule. A plan without one still works exactly as it did —
                this is an addition to it, not a replacement for it. */}
            {plan.generationStatus === 'ready' && schedule.length > 0 ? (
              <>
                <View style={s.schedHead}>
                  <Text style={s.schedTitle}>Your schedule</Text>
                  <Text style={s.schedSource}>
                    {plan.generatedBy === 'ai' ? 'Written for you' : 'Standard progression'}
                  </Text>
                </View>

                {!!plan.coachNotes && <Text style={s.coachNotes}>{plan.coachNotes}</Text>}

                {scheduleProgress && (
                  <Text style={s.schedProgress}>
                    {scheduleProgress.completedSessions} of {scheduleProgress.plannedSessions} sessions done
                    {scheduleProgress.completedKm > 0 ? ` · ${scheduleProgress.completedKm} of ${scheduleProgress.plannedKm} km` : ''}
                  </Text>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekTabs}>
                  {schedule.map((w) => (
                    <Pressable
                      key={w.weekNumber}
                      style={[s.weekTab, openWeek === w.weekNumber && s.weekTabOn]}
                      onPress={() => setOpenWeek(w.weekNumber)}
                    >
                      <Text style={[s.weekTabText, openWeek === w.weekNumber && s.weekTabTextOn]}>
                        Wk {w.weekNumber}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {schedule
                  .filter((w) => w.weekNumber === openWeek)
                  .map((w) => (
                    <Card key={w.weekNumber} style={s.weekCard}>
                      <Text style={s.weekFocus}>{w.focus}</Text>
                      <Text style={s.weekTarget}>{w.targetDistanceKm} km this week</Text>

                      {w.sessions.map((session) => (
                        <Pressable
                          key={session.sessionId}
                          style={[s.session, session.completed && s.sessionDone]}
                          onPress={() => (session.completed ? unmatchSession(session) : openRunPicker(session))}
                        >
                          <View style={s.sessionDay}>
                            <Text style={s.sessionDayText}>{DAY_LABELS[session.dayOfWeek - 1]}</Text>
                          </View>
                          <View style={s.sessionBody}>
                            <Text style={s.sessionType}>
                              {SESSION_LABELS[session.sessionType] ?? session.sessionType}
                              {session.distanceKm ? ` · ${session.distanceKm} km` : ''}
                            </Text>
                            {!!session.description && (
                              <Text style={s.sessionDesc} numberOfLines={2}>{session.description}</Text>
                            )}
                            {session.completed && !!session.completedRun && (
                              <Text style={s.sessionRun}>
                                Done — {session.completedRun.name || 'a run'} · {session.completedRun.distanceKm} km
                              </Text>
                            )}
                          </View>
                          <Text style={[s.sessionTick, session.completed && s.sessionTickOn]}>
                            {session.completed ? '✓' : '○'}
                          </Text>
                        </Pressable>
                      ))}
                    </Card>
                  ))}

                <Button variant="secondary" style={s.gap} onPress={handleGenerate} disabled={busy}>
                  {busy ? 'Rebuilding…' : 'Rebuild the schedule'}
                </Button>
              </>
            ) : plan.generationStatus === 'generating' || busy ? (
              <Card style={s.generating}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.generatingText}>Building your schedule…</Text>
                <Text style={s.generatingHint}>This takes a few seconds.</Text>
              </Card>
            ) : (
              <Card style={s.generating}>
                <Text style={s.generateTitle}>Turn this into a schedule</Text>
                <Text style={s.generatingHint}>
                  {usesAi
                    ? 'A week-by-week plan written around your recent running and your current risk score.'
                    : 'A week-by-week plan built from your recent running, rising about 10% a week with a lighter fourth week.'}
                </Text>
                {plan.generationStatus === 'failed' && !!plan.generationError && (
                  <Text style={s.generateFailed}>Last attempt did not finish. Try again.</Text>
                )}
                <Button style={s.gap} onPress={handleGenerate} disabled={busy}>Build my schedule</Button>
              </Card>
            )}

            <Button variant="secondary" style={s.gap} onPress={openEdit}>Edit Plan</Button>
            <Button variant="secondary" style={s.gap} onPress={openCreate}>Start a New Plan</Button>
            <Button variant="danger" style={s.gap} onPress={() => setConfirmDelete(true)}>Delete Plan</Button>
          </>
        ) : (
          <>
            <Card style={s.empty}>
              <Text style={s.emptyTitle}>No active plan</Text>
              <Text style={s.emptyBody}>
                A plan sets a goal, a weekly run target and a length, so your training has a
                shape to follow.
              </Text>
            </Card>
            <Button style={s.gap} onPress={openCreate}>Create a Plan</Button>
          </>
        )}

        {!editing && pastPlans.length > 0 && (
          <>
            <Text style={s.section}>Past plans</Text>
            {pastPlans.map((p) => (
              <Pressable key={p.planId} onPress={() => reactivate(p.planId)} disabled={busy} style={({ pressed }) => [s.past, pressed && s.pressed]}>
                <View style={s.pastCopy}>
                  <Text style={s.pastGoal}>{goalLabel(p.goalType)}</Text>
                  <Text style={s.pastMeta}>
                    {p.targetDistanceKm != null ? `${p.targetDistanceKm} km · ` : ''}
                    {p.weeklyFrequency ?? '—'}/week · {p.durationWeeks ?? '—'} weeks
                  </Text>
                </View>
                <Text style={s.pastAction}>Reactivate</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Delete this plan?</Text>
            <Text style={s.sheetBody}>Your runs are not affected — only the plan is removed.</Text>
            <Button variant="danger" onPress={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete Plan'}</Button>
            <Button variant="secondary" style={s.gap} onPress={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          </View>
        </View>
      </Modal>

      <BottomNav navigation={navigation} />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  loading: { marginTop: 48 },
  error: { ...type.body, color: colors.riskHigh, marginBottom: spacing.md },
  formTitle: { ...type.title, color: colors.ink, marginBottom: spacing.lg },
  label: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase', marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: -4 },
  hero: { padding: 20, marginBottom: 12 },
  heroLabel: { ...type.label, color: colors.primary, textTransform: 'uppercase' },
  heroGoal: { ...type.title, color: colors.ink, marginTop: 8 },
  heroStats: { flexDirection: 'row', marginTop: spacing.lg, gap: 12 },
  heroStat: { flex: 1 },
  heroValue: { fontSize: 19, fontWeight: '700', color: colors.ink },
  heroCaption: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  card: { padding: 16, marginBottom: 12 },
  cardTitle: { ...type.bodyStrong, color: colors.ink },
  // ── the generated schedule ──
  schedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl },
  schedTitle: { ...type.title, color: colors.ink },
  schedSource: { ...type.caption, color: colors.inkMuted },
  coachNotes: { ...type.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.sm },
  schedProgress: { ...type.caption, color: colors.ink, marginTop: spacing.sm, fontWeight: '600' },
  weekTabs: { marginTop: spacing.md, marginBottom: spacing.sm, flexGrow: 0 },
  weekTab: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  weekTabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekTabText: { ...type.caption, color: colors.inkMuted, fontWeight: '600' },
  weekTabTextOn: { color: colors.onPrimary ?? colors.ink },
  weekCard: { padding: spacing.lg },
  weekFocus: { ...type.bodyStrong, color: colors.ink },
  weekTarget: { ...type.caption, color: colors.inkMuted, marginTop: 2, marginBottom: spacing.md },
  session: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  sessionDone: { opacity: 0.72 },
  sessionDay: {
    width: 44, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised,
  },
  sessionDayText: { fontSize: 10.5, fontWeight: '700', color: colors.inkMuted },
  sessionBody: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  sessionType: { ...type.body, color: colors.ink, fontWeight: '600' },
  sessionDesc: { ...type.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 16 },
  sessionRun: { ...type.caption, color: colors.success, marginTop: 4, fontWeight: '600' },
  sessionTick: { fontSize: 20, color: colors.inkFaint, width: 24, textAlign: 'center' },
  sessionTickOn: { color: colors.success },
  generating: { padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  generatingText: { ...type.bodyStrong, color: colors.ink, marginTop: spacing.md },
  generatingHint: { ...type.caption, color: colors.inkMuted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
  generateTitle: { ...type.bodyStrong, color: colors.ink },
  generateFailed: { ...type.caption, color: colors.riskModerate, marginTop: spacing.sm },
  // ── the run picker ──
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '75%',
  },
  sheetTitle: { ...type.title, color: colors.ink },
  sheetHint: { ...type.caption, color: colors.inkMuted, marginTop: spacing.xs, lineHeight: 17 },
  sheetList: { marginVertical: spacing.md },
  sheetRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetRun: { ...type.body, color: colors.ink, fontWeight: '600' },
  sheetMeta: { ...type.caption, color: colors.inkMuted, marginTop: 2 },
  sheetEmpty: { ...type.caption, color: colors.inkMuted, paddingVertical: spacing.lg, textAlign: 'center' },
  progressValue: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 8 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, marginTop: 14, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  barDone: { backgroundColor: colors.success },
  progressHint: { ...type.caption, color: colors.inkMuted, marginTop: 10 },
  empty: { padding: 20 },
  emptyTitle: { ...type.subtitle, color: colors.ink },
  emptyBody: { ...type.caption, color: colors.inkMuted, marginTop: 8, lineHeight: 18 },
  gap: { marginTop: 12 },
  section: { ...type.subtitle, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  past: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  pastCopy: { flex: 1 },
  pastGoal: { ...type.bodyStrong, color: colors.ink },
  pastMeta: { ...type.caption, color: colors.inkMuted, marginTop: 4 },
  pastAction: { ...type.caption, fontWeight: '600', color: colors.primary },
  pressed: { opacity: 0.72 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, paddingBottom: 34 },
  sheetTitle: { ...type.title, color: colors.ink },
  sheetBody: { ...type.body, color: colors.inkMuted, marginTop: 8, marginBottom: spacing.lg },
});
