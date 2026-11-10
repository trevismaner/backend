import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, Alert, Pressable, RefreshControl } from 'react-native';
import viewAvailableRewardsController from '../control/ViewAvailableRewardsController.js';
import viewClaimedRewardsController from '../control/ViewClaimedRewardsController.js';
import viewUserBadgesController from '../control/ViewUserBadgesController.js';
import claimRewardController from '../control/ClaimRewardController.js';
import { Screen, Header, StatCard, Card, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

/**
 * What a runner can spend points on.
 *
 * The catalogue has always carried a reward_type (voucher / membership / badge), a description
 * and a stock count. None of the three reached the screen, so a $25 sportswear voucher looked
 * identical to a cap, and "50 available" stayed invisible right up to the moment stock ran out.
 * This screen renders all of it, grouped by type and cheapest first.
 *
 * Claiming is still one call to the backend, which decrements stock and deducts points in a
 * single transaction. The affordability check here only keeps the UI honest; it is not the rule.
 * The server refuses an unaffordable or out-of-stock claim whatever this screen shows.
 */

const TYPE_LABEL = { voucher: 'Voucher', membership: 'Membership', badge: 'Badge' };
const SECTION_ORDER = ['voucher', 'membership', 'badge'];
const SECTION_TITLE = {
  voucher: 'Vouchers', membership: 'Memberships', badge: 'Badges', other: 'Other rewards',
};

export default function RewardsScreen({ navigation }) {
  const [rewards, setRewards] = useState([]);
  const [points, setPoints] = useState(0);
  const [claims, setClaims] = useState([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [cat, claimed, badges] = await Promise.all([
      viewAvailableRewardsController(),
      viewClaimedRewardsController(),
      viewUserBadgesController(),
    ]);
    if (cat.success) {
      setRewards(cat.data.rewards || []);
      setPoints(cat.data.points || 0);
    }
    // The claimed list and the badge count are context, not the point of the screen. If either
    // fails the catalogue still renders, rather than the whole page erroring out.
    if (claimed.success) setClaims(claimed.data.claims || []);
    if (badges.success) {
      const earned = (badges.data.badges || []).filter((b) => b.earned_at ?? b.earnedAt);
      setBadgeCount(earned.length);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function claim(item) {
    const short = item.pointsRequired - points;
    if (short > 0) {
      return Alert.alert(
        'Not enough points yet',
        `${item.name} costs ${item.pointsRequired} points. You need ${short} more.`
      );
    }
    if (item.stock === 0) {
      return Alert.alert('Out of stock', `${item.name} has all been claimed.`);
    }
    Alert.alert('Claim this reward?', `${item.name} costs ${item.pointsRequired} points.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Claim',
        onPress: async () => {
          const r = await claimRewardController(item.rewardId);
          if (r.success) {
            Alert.alert('Reward claimed', `${item.name} is now in your claimed rewards.`);
            load();
          } else {
            Alert.alert('Could not claim reward', r.message);
          }
        },
      },
    ]);
  }

  // Grouped by type, each group cheapest first so the next reachable reward sits near the top.
  const sections = useMemo(() => {
    const byType = new Map();
    for (const r of rewards) {
      const key = SECTION_ORDER.includes(r.rewardType) ? r.rewardType : 'other';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(r);
    }
    const out = [];
    for (const key of [...SECTION_ORDER, 'other']) {
      const items = byType.get(key);
      if (!items || items.length === 0) continue;
      items.sort((a, b) => a.pointsRequired - b.pointsRequired);
      out.push({ key, title: SECTION_TITLE[key], data: items });
    }
    if (claims.length > 0) out.push({ key: 'claimed', title: 'Claimed', data: claims });
    return out;
  }, [rewards, claims]);

  const nextUp = useMemo(() => {
    const reachable = rewards
      .filter((r) => r.pointsRequired > points)
      .sort((a, b) => a.pointsRequired - b.pointsRequired)[0];
    return reachable ? { name: reachable.name, short: reachable.pointsRequired - points } : null;
  }, [rewards, points]);

  function renderReward(item) {
    const affordable = points >= item.pointsRequired;
    const soldOut = item.stock === 0;
    const pct = Math.min(100, (points / item.pointsRequired) * 100);
    const short = item.pointsRequired - points;

    return (
      <Pressable onPress={() => claim(item)} disabled={soldOut}>
        <Card style={[styles.reward, (!affordable || soldOut) && styles.rewardMuted]}>
          <View style={styles.rowTop}>
            <View style={styles.copy}>
              <Text style={styles.name}>{item.name}</Text>
              {!!item.description && (
                <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              )}
            </View>
            <View style={styles.priceBox}>
              <Text style={[styles.price, affordable && !soldOut && styles.priceOn]}>
                {item.pointsRequired}
              </Text>
              <Text style={styles.priceUnit}>pts</Text>
            </View>
          </View>

          <View style={styles.meta}>
            {!!TYPE_LABEL[item.rewardType] && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{TYPE_LABEL[item.rewardType]}</Text>
              </View>
            )}
            {item.stock !== null && item.stock !== undefined && (
              <Text style={[styles.stock, item.stock > 0 && item.stock <= 10 && styles.stockLow]}>
                {item.stock > 0 ? `${item.stock} left` : 'All claimed'}
              </Text>
            )}
          </View>

          {soldOut ? (
            <Text style={styles.state}>Out of stock</Text>
          ) : affordable ? (
            <Text style={[styles.state, styles.stateOn]}>Tap to claim</Text>
          ) : (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.state}>
                {short} more {short === 1 ? 'point' : 'points'}
              </Text>
            </>
          )}
        </Card>
      </Pressable>
    );
  }

  function renderClaim(item) {
    const when = item.claimed_at ?? item.claimedAt;
    const kind = TYPE_LABEL[item.reward_type ?? item.rewardType];
    return (
      <Card style={styles.claimed}>
        <View style={styles.copy}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.desc} numberOfLines={1}>
            {kind ? `${kind} · ` : ''}
            {when ? `Claimed ${new Date(when).toLocaleDateString()}` : 'Claimed'}
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Screen>
      <Header title="Rewards" navigation={navigation} />
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => String(item.rewardId ?? item.claim_id ?? i)}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.inkMuted} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.stats}>
              <StatCard value={String(points)} label="Points" />
              <StatCard value={String(badgeCount)} label="Badges" />
              <StatCard value={String(claims.length)} label="Claimed" />
            </View>
            {nextUp && (
              <Text style={styles.nextUp}>
                {nextUp.short} {nextUp.short === 1 ? 'point' : 'points'} to {nextUp.name}
              </Text>
            )}
          </>
        }
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item, section }) =>
          section.key === 'claimed' ? renderClaim(item) : renderReward(item)
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Loading rewards…' : 'No rewards available right now.'}
          </Text>
        }
        stickySectionHeadersEnabled={false}
      />
      <BottomNav navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 16 },
  nextUp: { ...type.body, color: colors.inkMuted, marginTop: 16 },
  section: { ...type.subtitle, color: colors.ink, marginTop: 26, marginBottom: 12 },

  reward: { padding: 16, marginBottom: 14 },
  rewardMuted: { opacity: 0.62 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  desc: { fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 17 },

  priceBox: { alignItems: 'flex-end', marginLeft: 14 },
  price: { fontSize: 20, fontWeight: '700', color: colors.inkMuted },
  priceOn: { color: colors.primary },
  priceUnit: { fontSize: 11, color: colors.inkMuted, marginTop: 1 },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 11,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  stock: { fontSize: 11, color: colors.inkMuted },
  stockLow: { color: colors.warning },

  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 14, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  state: { fontSize: 12, color: colors.inkMuted, marginTop: 10 },
  stateOn: { color: colors.success, fontWeight: '600' },

  claimed: { padding: 16, marginBottom: 12 },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: 30 },
});
