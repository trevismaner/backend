import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import viewRunDetailsController from '../control/ViewRunDetailsController.js';
import updateRunNameController from '../control/UpdateRunNameController.js';
import updateRunDescriptionController from '../control/UpdateRunDescriptionController.js';
import updateRunController from '../control/UpdateRunController.js';
import deleteRunController from '../control/DeleteRunController.js';
import shareRunController from '../control/ShareRunController.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';
import { formatDuration } from '../utils/geo.js';
import { mergePoints, regionForCoordinates } from '../utils/routeTrack.js';
import { Header, Screen } from '../components/AppUI.js';
import RunShareCard from '../components/RunShareCard.js';

export default function RunDetailsScreen({ route, navigation }) {
  const { runId } = route.params;
  const [run, setRun] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Corrections are held as text so a field can be cleared without becoming 0.
  const [editDistance, setEditDistance] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editAvgHeartRate, setEditAvgHeartRate] = useState('');
  const [isSavingCorrections, setIsSavingCorrections] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [snapshotUri, setSnapshotUri] = useState(null);

  const mapRef = useRef(null);
  const shareCardRef = useRef(null);

  useEffect(() => {
    loadRun();
  }, [runId]);

  async function loadRun() {
    const result = await viewRunDetailsController(runId);
    if (result.success) {
      const loaded = result.data.run;
      setRun(loaded);
      setName(loaded.name || '');
      setDescription(loaded.description || '');
      setEditDistance(loaded.distanceKm != null ? String(loaded.distanceKm) : '');
      setEditMinutes(loaded.durationSeconds ? String(Math.round(loaded.durationSeconds / 60)) : '');
      setEditCalories(loaded.caloriesBurned != null ? String(loaded.caloriesBurned) : '');
      setEditAvgHeartRate(loaded.avgHeartRate != null ? String(loaded.avgHeartRate) : '');
    } else {
      Alert.alert('Could not load run', result.message);
    }
  }

  /**
   * Sends only what the user actually changed. The server re-validates the whole run and
   * moves the points by the difference in distance.
   */
  async function handleSaveCorrections() {
    const changes = {};
    const distance = Number(editDistance);
    if (editDistance !== '' && distance !== Number(run.distanceKm)) changes.distanceKm = distance;

    const seconds = Math.round(Number(editMinutes) * 60);
    if (editMinutes !== '' && seconds !== run.durationSeconds) changes.durationSeconds = seconds;

    if (editCalories !== '' && Number(editCalories) !== run.caloriesBurned) changes.caloriesBurned = editCalories;
    if (editAvgHeartRate !== '' && Number(editAvgHeartRate) !== run.avgHeartRate) {
      changes.avgHeartRate = editAvgHeartRate;
    }

    if (Object.keys(changes).length === 0) {
      Alert.alert('Nothing to change', 'These figures already match the saved run.');
      return;
    }

    setIsSavingCorrections(true);
    const result = await updateRunController(runId, changes);
    setIsSavingCorrections(false);

    if (!result.success) {
      Alert.alert('Could not save corrections', result.message);
      return;
    }

    setRun(result.data.run);
    const adjustment = result.data.pointsAdjustment ?? 0;
    Alert.alert(
      'Run updated',
      adjustment === 0
        ? 'Your changes have been saved.'
        : `Your changes have been saved, and your points ${adjustment > 0 ? 'went up' : 'came down'} by ${Math.abs(adjustment)}.`
    );
  }

  function handleDelete() {
    Alert.alert(
      'Delete this run',
      'The run will be removed from your history, and the points it earned will be taken back.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            const result = await deleteRunController(runId);
            setIsDeleting(false);
            if (!result.success) {
              Alert.alert('Could not delete run', result.message);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  }

  async function handleSaveName() {
    setIsSavingName(true);
    const result = await updateRunNameController(runId, name);
    setIsSavingName(false);
    if (!result.success) {
      Alert.alert('Could not update name', result.message);
    }
  }

  async function handleSaveDescription() {
    setIsSavingDescription(true);
    const result = await updateRunDescriptionController(runId, description);
    setIsSavingDescription(false);
    if (!result.success) {
      Alert.alert('Could not update description', result.message);
    }
  }

  // These two sit ABOVE the loading guard deliberately. Hooks have to run in the same order
  // on every render, and `run` is null on the first one — putting a useMemo after the early
  // return meant the hook count changed the moment the run arrived, which React rejects
  // outright ("rendered more hooks than during the previous render"). Both handle a null run.
  //
  // Cleaned on the way in, so a run recorded before the GPS filtering existed is drawn
  // without the fixes that made it zig-zag. Memoised because a long route is a few thousand
  // points and this screen re-renders on every keystroke in the correction fields.
  const routePoints = useMemo(
    () => mergePoints([], Array.isArray(run?.routeGps) ? run.routeGps : []),
    [run?.routeGps]
  );
  // Computed, not hardcoded. This screen used to centre on routePoints[0] with a fixed 0.01°
  // span — about 1.1 km — so anything longer showed its start and a line leaving the frame.
  // With panning and zooming also switched off, a finished run looked like it had recorded
  // one point.
  const routeRegion = useMemo(() => regionForCoordinates(routePoints), [routePoints]);
  const hasRoute = routePoints.length > 1;

  if (!run) {
    return (
      <Screen><Header title="Run Details" navigation={navigation}/><Text style={styles.loadingText}>Loading run…</Text></Screen>
    );
  }

  /**
   * Shares the run as an image of the card rendered off-screen below.
   *
   * Two captures, and the first one is allowed to fail. `MapView.takeSnapshot()` puts the
   * real map behind the route, but it needs a working Google Maps key — which this project
   * has had rejected before, producing a blank map with only the Google watermark. When it
   * fails the card draws the route on its own field instead, so the share still carries the
   * shape of the run rather than nothing.
   */
  async function handleShare() {
    if (isSharing) return;
    setIsSharing(true);

    let mapSnapshotUri = null;
    if (hasRoute && mapRef.current?.takeSnapshot) {
      try {
        mapSnapshotUri = await mapRef.current.takeSnapshot({
          width: 360,
          height: 340,
          format: 'png',
          result: 'file',
        });
      } catch {
        mapSnapshotUri = null; // fall back to the drawn route
      }
    }
    setSnapshotUri(mapSnapshotUri);

    // One frame, so the card has actually rendered with the snapshot before it is captured.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const result = await shareRunController(run, {
      capture: async () => {
        if (!shareCardRef.current) return null;
        const { captureRef } = await import('react-native-view-shot');
        return captureRef(shareCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      },
    });

    setIsSharing(false);
    setSnapshotUri(null);

    if (!result.success) Alert.alert('Could not share this run', result.message);
  }

  /** Frames the whole route. Also the handler behind the "Fit route" button. */
  function fitToRoute() {
    if (routePoints.length === 0) return;
    if (routePoints.length === 1) {
      if (routeRegion) mapRef.current?.animateToRegion(routeRegion, 300);
      return;
    }
    // Padding in pixels rather than degrees, so a long thin route along one axis still gets
    // a sensible margin on the other.
    mapRef.current?.fitToCoordinates(routePoints, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }

  return (
    <Screen>
      <Header title="Run Details" navigation={navigation}/>
      <ScrollView contentContainerStyle={styles.content}>
        {hasRoute && (
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={routeRegion}
              // Framed again once the native view exists. `initialRegion` gets the first
              // paint right; this gets it exact, with a margin measured in screen pixels so
              // the line is never flush against the edge whatever the route's shape.
              onMapReady={fitToRoute}
              onLayout={fitToRoute}
              // The run is the thing being looked at, so let it be looked at.
              scrollEnabled
              zoomEnabled
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline
                coordinates={routePoints}
                strokeColor={colors.primary}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
              <Marker coordinate={routePoints[0]} title="Start" pinColor={colors.riskLow} />
              <Marker
                coordinate={routePoints[routePoints.length - 1]}
                title="Finish"
                pinColor={colors.primary}
              />
            </MapView>
            <Pressable style={styles.recentreButton} onPress={fitToRoute}>
              <Text style={styles.recentreText}>Fit route</Text>
            </Pressable>
          </View>
        )}
        {!hasRoute && (
          <View style={styles.noRoute}>
            <Text style={styles.noRouteText}>
              No GPS route was recorded for this run.
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{run.distanceKm}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{formatDuration(run.durationSeconds)}</Text>
            <Text style={styles.statLabel}>time</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{run.caloriesBurned ?? '—'}</Text>
            <Text style={styles.statLabel}>calories</Text>
          </View>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Pressable style={styles.saveLink} onPress={handleSaveName} disabled={isSavingName}>
          <Text style={styles.saveLinkText}>{isSavingName ? 'Saving…' : 'Save name'}</Text>
        </Pressable>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Pressable style={styles.saveLink} onPress={handleSaveDescription} disabled={isSavingDescription}>
          <Text style={styles.saveLinkText}>{isSavingDescription ? 'Saving…' : 'Save description'}</Text>
        </Pressable>

        <Text style={styles.label}>Correct the figures</Text>
        <Text style={styles.hint}>
          Fix a distance GPS got wrong, or fill in calories and heart rate. Changing the
          distance adjusts the points this run earned.
        </Text>
        <View style={styles.correctionRow}>
          {[
            ['Distance (km)', editDistance, setEditDistance, 'decimal-pad'],
            ['Duration (min)', editMinutes, setEditMinutes, 'decimal-pad'],
          ].map(([label, value, onChange, keyboardType]) => (
            <View key={label} style={styles.correctionField}>
              <Text style={styles.smallLabel}>{label}</Text>
              <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} />
            </View>
          ))}
        </View>
        <View style={styles.correctionRow}>
          {[
            ['Calories', editCalories, setEditCalories],
            ['Avg heart rate', editAvgHeartRate, setEditAvgHeartRate],
          ].map(([label, value, onChange]) => (
            <View key={label} style={styles.correctionField}>
              <Text style={styles.smallLabel}>{label}</Text>
              <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType="number-pad" />
            </View>
          ))}
        </View>
        <Pressable style={styles.saveLink} onPress={handleSaveCorrections} disabled={isSavingCorrections}>
          <Text style={styles.saveLinkText}>{isSavingCorrections ? 'Saving…' : 'Save corrections'}</Text>
        </Pressable>

        <Pressable style={styles.shareButton} onPress={handleShare} disabled={isSharing}>
          <Text style={styles.shareButtonText}>
            {isSharing ? 'Preparing image…' : 'Share this run'}
          </Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={isDeleting}>
          <Text style={styles.deleteButtonText}>{isDeleting ? 'Deleting…' : 'Delete this run'}</Text>
        </Pressable>

        {/*
          The card that gets captured. Positioned off-screen rather than hidden: a view with
          `display: none`, zero opacity or zero size does not render on the GPU, and
          captureRef then returns a blank image. Moving it off the left edge keeps it a real,
          laid-out, drawn view that simply is not where the person is looking.
        */}
        <View style={styles.shareCardHost} pointerEvents="none">
          <View ref={shareCardRef} collapsable={false}>
            <RunShareCard run={run} routePoints={routePoints} mapSnapshotUri={snapshotUri} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  loadingText: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xl },
  // Taller than the old 180: a route is the point of this screen, and a letterbox strip is
  // what made a long run look like it had no shape.
  mapWrap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
  recentreButton: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  recentreText: { ...type.caption, color: colors.primary, fontWeight: '600' },
  noRoute: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  noRouteText: { ...type.caption, color: colors.inkMuted, textAlign: 'center' },
  // Off-screen, not hidden — see the comment where this is used.
  shareCardHost: { position: 'absolute', left: -10000, top: 0, opacity: 1 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  statBlock: { alignItems: 'center' },
  statValue: { ...type.title, color: colors.ink },
  statLabel: { ...type.caption, color: colors.inkMuted },
  label: { ...type.label, color: colors.inkMuted, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: type.body.fontSize,
    color: colors.ink,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  saveLink: { alignSelf: 'flex-end', marginTop: spacing.xs },
  saveLinkText: { ...type.caption, color: colors.primary, fontWeight: '600' },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  shareButtonText: { ...type.bodyStrong, color: colors.primary },
  hint: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.sm },
  correctionRow: { flexDirection: 'row', gap: spacing.md },
  correctionField: { flex: 1 },
  smallLabel: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.xs },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.riskHigh,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  deleteButtonText: { ...type.bodyStrong, color: colors.riskHigh },
});
