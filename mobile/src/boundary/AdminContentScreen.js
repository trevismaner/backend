import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import adminListRewardsController from '../control/AdminListRewardsController.js';
import adminCreateRewardController from '../control/AdminCreateRewardController.js';
import adminUpdateRewardController from '../control/AdminUpdateRewardController.js';
import adminListBadgesController from '../control/AdminListBadgesController.js';
import adminCreateBadgeController from '../control/AdminCreateBadgeController.js';
import adminUpdateBadgeController from '../control/AdminUpdateBadgeController.js';
import adminDeleteBadgeController from '../control/AdminDeleteBadgeController.js';
import { Screen, Header, Card, Field, Button, Chip } from '../components/AppUI.js';
import { AdminNav, Pill, Confirm, Loading, Empty, ErrorText, SectionLabel, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const REWARD_TYPES = ['voucher', 'membership', 'badge'];

export default function AdminContentScreen({ navigation }) {
  const [tab, setTab] = useState('REWARDS');
  const [rewards, setRewards] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState(null); // 'reward' | 'badge'

  const [rName, setRName] = useState('');
  const [rDesc, setRDesc] = useState('');
  const [rPoints, setRPoints] = useState('');
  const [rType, setRType] = useState('voucher');
  const [rStock, setRStock] = useState('');
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');

  const load = useCallback(async () => {
    const [rw, bd] = await Promise.all([adminListRewardsController(), adminListBadgesController()]);
    if (rw.success) setRewards(rw.data.rewards || []); else setError(rw.message);
    if (bd.success) setBadges(bd.data.badges || []); else setError(bd.message);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(call) {
    setBusy(true);
    setError('');
    const result = await call();
    setBusy(false);
    setConfirm(null);
    if (result.success) {
      setForm(null);
      await load();
      return true;
    }
    setError(result.message);
    return false;
  }

  async function createReward() {
    const ok = await run(() => adminCreateRewardController({
      name: rName,
      description: rDesc || null,
      pointsRequired: Number(rPoints),
      rewardType: rType,
      stock: rStock === '' ? null : Number(rStock),
    }));
    if (ok) { setRName(''); setRDesc(''); setRPoints(''); setRStock(''); setRType('voucher'); }
  }

  async function createBadge() {
    const ok = await run(() => adminCreateBadgeController({ name: bName, description: bDesc || null }));
    if (ok) { setBName(''); setBDesc(''); }
  }

  function askToggleReward(reward) {
    const activating = !reward.isActive;
    setConfirm({
      title: activating ? `Activate "${reward.name}"?` : `Deactivate "${reward.name}"?`,
      message: activating
        ? 'Users with enough points will be able to claim it.'
        : 'It stays in the catalog but nobody can claim it.',
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      destructive: !activating,
      run: () => run(() => adminUpdateRewardController({ rewardId: reward.rewardId, changes: { isActive: activating } })),
    });
  }

  function askDeleteBadge(badge) {
    setConfirm({
      title: `Delete "${badge.name}"?`,
      message: badge.earnedCount > 0
        ? `${badge.earnedCount} user${badge.earnedCount === 1 ? '' : 's'} already earned this badge. The server may refuse to delete it if it is awarded automatically.`
        : 'The server refuses to delete the automatic milestone badges (First Steps, Consistent Runner, Marathoner, Team Player, Competitor).',
      confirmLabel: 'Delete',
      destructive: true,
      run: () => run(() => adminDeleteBadgeController(badge.badgeId)),
    });
  }

  return (
    <Screen>
      <Header title="Rewards & Badges" navigation={navigation} />
      <ScrollView contentContainerStyle={adminStyles.content}>
        <View style={s.tabs}>
          <Chip active={tab === 'REWARDS'} onPress={() => { setTab('REWARDS'); setForm(null); }}>Rewards</Chip>
          <Chip active={tab === 'BADGES'} onPress={() => { setTab('BADGES'); setForm(null); }}>Badges</Chip>
        </View>

        <ErrorText>{error}</ErrorText>

        {loading ? <Loading /> : tab === 'REWARDS' ? (
          <>
            {rewards.length === 0 ? <Empty>No rewards in the catalog.</Empty> : rewards.map((reward) => (
              <Card key={reward.rewardId} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardCopy}>
                    <Text numberOfLines={1} style={s.cardTitle}>{reward.name}</Text>
                    <Text style={s.cardMeta}>
                      {reward.pointsRequired} pts · {reward.rewardType || 'no type'} ·{' '}
                      {reward.stock === null ? 'unlimited' : `${reward.stock} left`} · {reward.claimCount ?? 0} claimed
                    </Text>
                  </View>
                  <Pill tone={reward.isActive ? 'good' : 'neutral'}>{reward.isActive ? 'Active' : 'Off'}</Pill>
                </View>
                {!!reward.description && <Text numberOfLines={2} style={s.cardDesc}>{reward.description}</Text>}
                <Pressable disabled={busy} onPress={() => askToggleReward(reward)} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                  <Text style={s.actionText}>{reward.isActive ? 'Deactivate' : 'Activate'}</Text>
                </Pressable>
              </Card>
            ))}

            {form === 'reward' ? (
              <Card style={s.form}>
                <SectionLabel>New reward</SectionLabel>
                <Field label="Name" value={rName} onChangeText={setRName} placeholder="e.g. $10 Sportswear Voucher" />
                <Field label="Description" value={rDesc} onChangeText={setRDesc} placeholder="What the user gets" multiline />
                <Field label="Points required" value={rPoints} onChangeText={setRPoints} placeholder="500" keyboardType="number-pad" />
                <Field label="Stock (blank = unlimited)" value={rStock} onChangeText={setRStock} placeholder="100" keyboardType="number-pad" />
                <View style={s.chips}>
                  {REWARD_TYPES.map((t) => <Chip key={t} active={rType === t} onPress={() => setRType(t)}>{t}</Chip>)}
                </View>
                <Button style={s.formBtn} onPress={createReward} disabled={busy}>{busy ? 'Saving…' : 'Add Reward'}</Button>
                <Button variant="secondary" onPress={() => setForm(null)} disabled={busy}>Cancel</Button>
              </Card>
            ) : (
              <Button style={s.add} variant="secondary" onPress={() => setForm('reward')}>Add Reward</Button>
            )}
          </>
        ) : (
          <>
            {badges.length === 0 ? <Empty>No badges in the catalog.</Empty> : badges.map((badge) => (
              <Card key={badge.badgeId} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardCopy}>
                    <Text numberOfLines={1} style={s.cardTitle}>{badge.name}</Text>
                    <Text style={s.cardMeta}>
                      Earned by {badge.earnedCount ?? 0} user{badge.earnedCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
                {!!badge.description && <Text numberOfLines={2} style={s.cardDesc}>{badge.description}</Text>}
                <Pressable disabled={busy} onPress={() => askDeleteBadge(badge)} style={({ pressed }) => [s.action, s.actionDanger, pressed && s.pressed]}>
                  <Text style={[s.actionText, s.actionDangerText]}>Delete</Text>
                </Pressable>
              </Card>
            ))}

            {form === 'badge' ? (
              <Card style={s.form}>
                <SectionLabel>New badge</SectionLabel>
                <Field label="Name" value={bName} onChangeText={setBName} placeholder="e.g. Hill Crusher" />
                <Field label="Description" value={bDesc} onChangeText={setBDesc} placeholder="How it is earned" multiline />
                <Button style={s.formBtn} onPress={createBadge} disabled={busy}>{busy ? 'Saving…' : 'Add Badge'}</Button>
                <Button variant="secondary" onPress={() => setForm(null)} disabled={busy}>Cancel</Button>
              </Card>
            ) : (
              <Button style={s.add} variant="secondary" onPress={() => setForm('badge')}>Add Badge</Button>
            )}
            <Text style={s.hint}>Badges created here can be awarded by hand from any account screen.</Text>
          </>
        )}
      </ScrollView>
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
      <AdminNav navigation={navigation} active="Content" />
    </Screen>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  card: { padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  cardDesc: { ...type.caption, color: colors.inkFaint, marginTop: 10, lineHeight: 17 },
  action: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  actionDanger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  actionText: { ...type.caption, fontWeight: '600', color: colors.ink },
  actionDangerText: { color: colors.riskHigh },
  form: { padding: 14, marginTop: spacing.md, gap: 4 },
  formBtn: { marginTop: spacing.sm, marginBottom: 10 },
  add: { marginTop: spacing.md },
  chips: { flexDirection: 'row', gap: 8, marginTop: 4 },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: spacing.lg, lineHeight: 17 },
  pressed: { opacity: 0.72 },
});
