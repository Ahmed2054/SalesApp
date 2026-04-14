import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Animated, DeviceEventEmitter,
  Linking, Share
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getAllDebtors, deleteDebtor, getDebtorStats } from '../storage/database';

const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function DebtorsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [debtors, setDebtors] = useState([]);
  const [stats, setStats] = useState({ totalOwed: 0, count: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // all | paid | owing

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return debtors;
    if (statusFilter === 'paid') return debtors.filter(d => d.balance <= 0);
    if (statusFilter === 'owing') return debtors.filter(d => d.balance > 0);
    return debtors;
  }, [debtors, statusFilter]);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([getAllDebtors(), getDebtorStats()]);
      setDebtors(list);
      setStats(s);
    } catch (e) {
      console.error('[SaleApp] DebtorsScreen error:', e);
      Alert.alert('Error', 'Could not load debtors list.');
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('db_restored', load);
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Debtor',
      `Stop tracking ${item.name}?\n\nThis will remove the record.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDebtor(item.id); load(); } },
      ]
    );
  };

  const renderRightActions = (progress, dragX, item) => {
    const transEdit = dragX.interpolate({
      inputRange: [-160, -80, 0],
      outputRange: [0, 80, 160],
      extrapolate: 'clamp',
    });
    const transDelete = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.rightActionsRow}>
        <Animated.View style={[styles.actionBtn, styles.editAction, { transform: [{ translateX: transEdit }] }]}>
          <TouchableOpacity
            style={styles.actionOpacity}
            onPress={() => navigation.navigate('AddDebtor', { record: item })}
          >
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionBtn, styles.deleteAction, { transform: [{ translateX: transDelete }] }]}>
          <TouchableOpacity
            style={styles.actionOpacity}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const isPaid = item.balance <= 0;

    const handleCall = () => {
      if (item.phone) Linking.openURL(`tel:${item.phone}`);
    };
    const handleWhatsApp = () => {
      const num = item.phone.replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${num.startsWith('0') ? '233' + num.slice(1) : num}`);
    };
    const handleSMS = () => {
      if (item.phone) Linking.openURL(`sms:${item.phone}`);
    };
    const buildDebtMsg = () => {
      const dueStr = item.duedate
        ? new Date(item.duedate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Not set';
      return (
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋  *DEBT RECORD*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Name:* ${item.name}\n` +
        (item.phone  ? `📞 *Phone:* ${item.phone}\n` : '') +
        (item.address? `📍 *Address:* ${item.address}\n` : '') +
        `\n💰 *Amount Lent:* ${fmt(item.amount)}\n` +
        `📉 *Balance Due:* ${fmt(item.balance)}\n` +
        `🔖 *Status:* ${isPaid ? '✅ FULLY PAID' : '⏳ STILL OWING'}\n` +
        `📅 *Due Date:* ${dueStr}\n` +
        (item.note ? `📝 *Note:* ${item.note}\n` : '') +
        `\n_Sent via SalesApp_`
      );
    };

    const handleShare = async () => {
      const msg = buildDebtMsg();
      if (item.phone && item.isWhatsapp) {
        // Open WhatsApp directly with pre-filled message
        const num = item.phone.replace(/[^0-9]/g, '');
        const wa = num.startsWith('0') ? '233' + num.slice(1) : num;
        Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
      } else {
        await Share.share({ message: msg });
      }
    };

    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        rightThreshold={40}
        friction={2}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('DebtorDetail', { debtorId: item.id })}
        >
          <View style={styles.card}>
            <View style={[styles.cardAccent, { backgroundColor: isPaid ? '#4caf50' : '#0277bd' }]} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {!!item.phone && <Text style={styles.cardInfoMini}>📞 {item.phone}</Text>}
                </View>
                <Text style={[styles.cardStatus, { color: isPaid ? '#4caf50' : '#0277bd' }]}>
                  {isPaid ? 'FULLY PAID' : 'STILL OWING YOU'}
                </Text>
              </View>
              <View style={styles.cardValues}>
                <View>
                  <Text style={styles.valLabel}>AMOUNT LENT</Text>
                  <Text style={styles.valAmt}>{fmt(item.amount)}</Text>
                </View>
                <View style={styles.divider} />
                <View>
                  <Text style={[styles.valLabel, { color: isPaid ? '#4caf50' : '#0277bd' }]}>BALANCE DUE</Text>
                  <Text style={[styles.valAmtLarge, { color: isPaid ? '#4caf50' : '#0277bd' }]}>{fmt(item.balance)}</Text>
                </View>
              </View>
              {!!item.duedate && (
                <Text style={styles.cardDue}>
                  {new Date(item.duedate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              )}
              {!!item.note && <Text style={styles.cardNote}>{item.note}</Text>}

              {/* ── Action Pill Buttons ── */}
              <View style={styles.actionIconRow}>
                {!!item.phone && (
                  <TouchableOpacity style={[styles.pill, styles.pillCall]} onPress={handleCall}>
                    <Text style={styles.pillEmoji}>📞</Text>
                    <Text style={[styles.pillLabel, { color: '#0277bd' }]}>Call</Text>
                  </TouchableOpacity>
                )}
                {!!item.phone && item.isWhatsapp && (
                  <TouchableOpacity style={[styles.pill, styles.pillWA]} onPress={handleWhatsApp}>
                    <Text style={styles.pillEmoji}>💬</Text>
                    <Text style={[styles.pillLabel, { color: '#25D366' }]}>WA</Text>
                  </TouchableOpacity>
                )}
                {!!item.phone && (
                  <TouchableOpacity style={[styles.pill, styles.pillSMS]} onPress={handleSMS}>
                    <Text style={styles.pillEmoji}>✉️</Text>
                    <Text style={[styles.pillLabel, { color: '#7b1fa2' }]}>SMS</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.pill, styles.pillShare]} onPress={handleShare}>
                  <Text style={styles.pillEmoji}>↗</Text>
                  <Text style={[styles.pillLabel, { color: '#e65100' }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top - 30 }]}>
        <Text style={styles.headerDesc}>Those who are owing you</Text>
        <View style={styles.headerIconContainer}>
          <Text style={styles.headerEmoji}>💳</Text>
        </View>

        <Text style={styles.headerLabel}>Total Debtors Balance</Text>
        <Text style={styles.headerValue}>{fmt(stats.totalOwed)}</Text>
        <Text style={styles.headerCount}>{stats.count} Debtor{stats.count === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.chipRow}>
        {[
          { label: 'All', value: 'all' },
          { label: 'Still Owing', value: 'owing' },
          { label: 'Fully Paid', value: 'paid' }
        ].map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <TouchableOpacity
              key={chip.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusFilter(chip.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0277bd']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🤝</Text>
            <Text style={styles.emptyTitle}>No Debtors?</Text>
            <Text style={styles.emptySub}>Add people who owe you money here to keep track of collections.</Text>
          </View>
        }
      />

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom }]}
        onPress={() => navigation.navigate('AddDebtor')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f7ff' },
  header: {
    backgroundColor: '#0277bd',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
  },
  headerDesc: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '800',
    marginBottom: - 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 5 },
  headerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 15,
    marginBottom: 5,
  },
  headerEmoji: {
    fontSize: 22,
  },
  headerValue: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 8 },
  headerCount: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontWeight: '700' },

  sectionRow: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 },

  chipRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginVertical: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#0277bd', borderColor: '#0277bd' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  chipTextActive: { color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    marginVertical: 8,
    elevation: 4,
    shadowColor: '#0277bd',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  cardAccent: { width: 6, height: '100%' },
  cardBody: { flex: 1, padding: 18 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardName: { fontSize: 18, fontWeight: '800', color: '#333' },
  cardInfoMini: { fontSize: 11, color: '#0277bd', fontWeight: '700', marginTop: 2, opacity: 0.8 },
  cardStatus: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  cardValues: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', padding: 12, borderRadius: 12 },
  valLabel: { fontSize: 10, color: '#999', fontWeight: '700', marginBottom: 2 },
  valAmt: { fontSize: 14, fontWeight: '700', color: '#555' },
  valAmtLarge: { fontSize: 18, fontWeight: '900' },
  divider: { width: 1, backgroundColor: '#eee', height: '60%', marginHorizontal: 16 },

  cardDue: { fontSize: 12, color: '#0277bd', fontWeight: '800', marginTop: 12 },
  cardNote: { fontSize: 12, color: '#666', marginTop: 6, opacity: 0.7 },

  actionIconRow: { flexDirection: 'row', marginTop: 12, gap: 6, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 4 },
  pillCall: { backgroundColor: '#e3f2fd' },
  pillWA:   { backgroundColor: '#e8f5e9' },
  pillSMS:  { backgroundColor: '#f3e5f5' },
  pillShare:{ backgroundColor: '#fff3e0' },
  pillEmoji:{ fontSize: 13 },
  pillLabel:{ fontSize: 11, fontWeight: '800' },

  rightActionsRow: { flexDirection: 'row', width: 160, marginVertical: 8, borderRadius: 18, overflow: 'hidden' },
  actionBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionOpacity: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  editAction: { backgroundColor: '#546e7a' },
  deleteAction: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 60, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#444' },
  emptySub: { fontSize: 14, color: '#94a3b8', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },

  fab: {
    position: 'absolute',
    right: 22,
    backgroundColor: '#0277bd',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#0277bd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  fabText: { fontSize: 30, color: '#fff', marginTop: -2 },
});
