import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Modal, ScrollView, Animated, DeviceEventEmitter
} from 'react-native';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getAllSales, deleteSale } from '../storage/database';
import { usePeriod } from '../context/PeriodContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildYearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= 2020; y--) years.push(y);
  return years;
}

const YEARS = buildYearOptions();

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

// ── Dropdown component ────────────────────────────────────────────────────────
function Dropdown({ label, value, options, onSelect, renderLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={dd.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={dd.triggerText}>{renderLabel ? renderLabel(value) : value}</Text>
        <Text style={dd.arrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dd.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={dd.sheet}>
            <Text style={dd.sheetTitle}>{label}</Text>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const isActive = opt === value;
                return (
                  <TouchableOpacity
                    key={String(opt)}
                    style={[dd.option, isActive && dd.optionActive]}
                    onPress={() => { onSelect(opt); setOpen(false); }}
                  >
                    <Text style={[dd.optionText, isActive && dd.optionTextActive]}>
                      {renderLabel ? renderLabel(opt) : opt}
                    </Text>
                    {isActive && <Text style={dd.check}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const dd = StyleSheet.create({
  trigger: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  arrow: { fontSize: 12, color: '#1a237e', fontWeight: '900' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    backgroundColor: '#fff', borderRadius: 18,
    width: '100%', maxHeight: 380,
    paddingVertical: 8, elevation: 16,
  },
  sheetTitle: {
    fontSize: 11, fontWeight: '800', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#fafafa',
  },
  optionActive: { backgroundColor: '#f0f4ff' },
  optionText: { flex: 1, fontSize: 15, color: '#333' },
  optionTextActive: { color: '#0d47a1', fontWeight: '700' },
  check: { fontSize: 14, color: '#1a237e', fontWeight: '900' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SalesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const now = new Date();

  const [allRecords, setAllRecords] = useState([]);
  const { selectedYear, setSelectedYear, selectedMonth, setSelectedMonth } = usePeriod();
  const [selectedDateFilter, setSelectedDateFilter] = useState(null);       // YYYY-MM-DD
  const [refreshing, setRefreshing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all'); // all | deposit | withdrawal

  const loadRecords = useCallback(async () => {
    try {
      const data = await getAllSales();
      setAllRecords(data);
    } catch (e) {
      console.error('[Sales App] SalesScreen: Fetch error:', e);
      Alert.alert('Database Error', 'Could not load sales history.');
    }
  }, []);

  useFocusEffect(useCallback(() => { loadRecords(); }, [loadRecords]));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('db_restored', loadRecords);
    return () => sub.remove();
  }, [loadRecords]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecords();
    setRefreshing(false);
  };

  const handleDelete = (record) => {
    Alert.alert(
      'Delete Record',
      `Delete the entry for ${record.date}?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => { await deleteSale(record.id); loadRecords(); },
        },
      ]
    );
  };

  const filtered = useMemo(() => {
    let list = allRecords;
    if (selectedDateFilter) {
      list = list.filter((r) => r.dateISO?.startsWith(selectedDateFilter));
    } else {
      const monthStr = selectedMonth === -1 ? '' : `-${String(selectedMonth + 1).padStart(2, '0')}`;
      const prefix = `${selectedYear}${monthStr}`;
      list = list.filter((r) => r.dateISO?.startsWith(prefix));
    }

    if (typeFilter !== 'all') {
      list = list.filter(r => r.type === typeFilter);
    }
    return list;
  }, [allRecords, selectedYear, selectedMonth, selectedDateFilter, typeFilter]);

  const markedDates = useMemo(() => {
    if (selectedMonth === -1) return {};
    const marks = {};
    const year = selectedYear;
    const month = selectedMonth + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const recordedDates = new Set(
      allRecords
        .filter(r => r.dateISO?.startsWith(`${year}-${String(month).padStart(2, '0')}`))
        .map(r => r.dateISO.split('T')[0])
    );

    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (recordedDates.has(dateStr)) {
        marks[dateStr] = {
          marked: true, dotColor: '#2e7d32',
          customStyles: {
            container: { backgroundColor: '#e8f5e9', borderRadius: 8 },
            text: { color: '#2e7d32', fontWeight: 'bold' },
          },
        };
      } else if (dateStr <= todayStr) {
        marks[dateStr] = {
          marked: true, dotColor: '#c62828',
          customStyles: {
            container: { backgroundColor: '#ffebee', borderRadius: 8 },
            text: { color: '#c62828' },
          },
        };
      }
    }
    return marks;
  }, [allRecords, selectedYear, selectedMonth]);

  const { monthTotal, totalDeposits, totalWithdrawals } = useMemo(() => {
    let dep = 0;
    let wit = 0;
    filtered.forEach(r => {
      if (r.type === 'withdrawal') wit += r.amount;
      else dep += r.amount;
    });
    return {
      monthTotal: dep - wit,
      totalDeposits: dep,
      totalWithdrawals: wit,
    };
  }, [filtered]);

  const renderRightActions = (progress, dragX, item) => {
    const transEdit = dragX.interpolate({
      inputRange: [-160, -80, 0], outputRange: [0, 80, 160], extrapolate: 'clamp',
    });
    const transDelete = dragX.interpolate({
      inputRange: [-80, 0], outputRange: [0, 80], extrapolate: 'clamp',
    });
    return (
      <View style={styles.rightActionsRow}>
        <Animated.View style={[styles.actionBtn, styles.editAction, { transform: [{ translateX: transEdit }] }]}>
          <TouchableOpacity style={styles.actionOpacity} onPress={() => navigation.navigate('AddSale', { record: item })}>
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionBtn, styles.deleteAction, { transform: [{ translateX: transDelete }] }]}>
          <TouchableOpacity style={styles.actionOpacity} onPress={() => handleDelete(item)}>
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const isWithdrawal = item.type === 'withdrawal';
    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        rightThreshold={40}
        friction={2}
      >
        <View style={styles.card}>
          <View style={[styles.cardAccent, isWithdrawal && styles.cardAccentWithdraw]} />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardType}>
                {isWithdrawal ? (
                  <MaterialCommunityIcons name="cash-minus" size={14} color="#777" />
                ) : (
                  <MaterialCommunityIcons name="cash-plus" size={14} color="#777" />
                )}
                {isWithdrawal ? ' Withdrawal' : ' Deposit'}
              </Text>
              <Text style={[styles.cardAmount, isWithdrawal && styles.cardAmountWithdraw]}>
                {isWithdrawal ? '-' : ''}{fmt(item.amount)}
              </Text>
            </View>
            <Text style={styles.cardDate}>
              {new Date(item.dateISO).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            {!!item.note && <Text style={styles.cardNote}>{item.note}</Text>}
          </View>
        </View>
      </Swipeable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top - 20 }]}>
        <View style={styles.filterWrap}>
          <Dropdown label="Year" value={selectedYear} options={YEARS} onSelect={setSelectedYear} />
          <Dropdown
            label="Month"
            value={selectedMonth}
            options={[-1, ...MONTHS.map((_, i) => i)]}
            onSelect={setSelectedMonth}
            renderLabel={(i) => i === -1 ? 'All Months' : MONTHS[i]}
          />
        </View>

        <View style={styles.headerIconContainer}>
          <MaterialIcons name="shopping-bag" size={24} color="#fff" />
        </View>

        <Text style={styles.headerLabel}>Total Sales Balance</Text>
        <Text style={styles.headerValue}>{fmt(monthTotal)}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{filtered.length}</Text>
            <Text style={styles.summaryLabel}>Entries</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{fmt(totalDeposits)}</Text>
            <Text style={styles.summaryLabel}>Depo.</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{fmt(totalWithdrawals)}</Text>
            <Text style={styles.summaryLabel}>Withd.</Text>
          </View>
        </View>
      </View>

      {/* ── Section Row ── */}
      <View style={styles.sectionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>
            {selectedDateFilter ? `History: ${selectedDateFilter}` : 'Sales History'}
          </Text>
          <Text style={styles.sectionCount}>{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {selectedDateFilter && (
            <TouchableOpacity
              style={[styles.calBtn, { borderColor: '#c62828' }]}
              onPress={() => setSelectedDateFilter(null)}
            >
              <Text style={[styles.calBtnText, { color: '#c62828' }]}>✕ Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.calBtn} onPress={() => setShowCalendar(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={14} color="#1a237e" />
              <Text style={styles.calBtnText}>View Calendar</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Type Filter Chips ── */}
      <View style={styles.chipRow}>
        {[
          { label: 'All', value: 'all' },
          { label: 'Deposits', value: 'deposit' },
          { label: 'Withdrawals', value: 'withdrawal' }
        ].map((chip) => {
          const active = typeFilter === chip.value;
          return (
            <TouchableOpacity
              key={chip.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTypeFilter(chip.value)}
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0d47a1']} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={60} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No records for {MONTHS[selectedMonth]} {selectedYear}</Text>
            <Text style={styles.emptySub}>Tap + to add a new sales entry</Text>
          </View>
        }
      />

      {/* ── Calendar Modal ── */}
      <Modal visible={showCalendar} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCalendar(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#2e7d32' }]} />
                  <Text style={styles.legendText}>Recorded</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#c62828' }]} />
                  <Text style={styles.legendText}>Missing</Text>
                </View>
              </View>
              <Calendar
                current={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`}
                markingType={'custom'}
                markedDates={markedDates}
                renderHeader={(date) => {
                  const d = new Date(date);
                  return (
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1a237e' }}>
                      {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}
                    </Text>
                  );
                }}
                theme={{
                  calendarBackground: '#fff',
                  textSectionTitleColor: '#b6c1cd',
                  selectedDayBackgroundColor: '#1a237e',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#1a237e',
                  dayTextColor: '#2d4150',
                  textDisabledColor: '#d9e1e8',
                  dotColor: '#1a237e',
                  arrowColor: '#1a237e',
                  monthTextColor: '#1a237e',
                  textDayFontWeight: '600',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '800',
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
                onMonthChange={(month) => {
                  setSelectedYear(month.year);
                  setSelectedMonth(month.month - 1);
                }}
                onDayPress={(day) => {
                  const hasExisting = allRecords.some(r => r.dateISO?.split('T')[0] === day.dateString);
                  setShowCalendar(false);
                  if (hasExisting) {
                    setSelectedDateFilter(day.dateString);
                  } else {
                    setSelectedDateFilter(null);
                    navigation.navigate('AddSale', { record: null, initialDateISO: day.dateString });
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom }]}
        onPress={() => navigation.navigate('AddSale', { record: null })}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    backgroundColor: '#1a237e',
    paddingHorizontal: 20,
    paddingBottom: 4,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  filterWrap: { flexDirection: 'row', marginBottom: 2, gap: 8 },
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
  headerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginTop: 5 },
  headerValue: { fontSize: 36, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 0, letterSpacing: -1 },
  summaryRow: { flexDirection: 'row', marginTop: 24, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, paddingVertical: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 13, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 5, paddingBottom: 5, alignItems: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },
  sectionCount: { fontSize: 11, color: '#aaa', fontWeight: '600' },

  chipRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginVertical: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a237e', borderColor: '#1a237e' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  chipTextActive: { color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14,
    marginVertical: 6, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
    overflow: 'hidden', alignItems: 'center',
  },
  cardAccent: { width: 5, height: '100%', backgroundColor: '#2e7d32' },
  cardAccentWithdraw: { backgroundColor: '#c62828' },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardType: { fontSize: 11, fontWeight: '800', color: '#777', textTransform: 'uppercase' },
  cardAmount: { fontSize: 16, fontWeight: '800', color: '#2e7d32' },
  cardAmountWithdraw: { color: '#c62828' },
  cardDate: { fontSize: 11, color: '#aaa' },
  cardNote: { fontSize: 12, color: '#666', marginTop: 6, fontStyle: 'italic' },

  rightActionsRow: { flexDirection: 'row', width: 160, marginVertical: 6, borderRadius: 14, overflow: 'hidden' },
  actionBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionOpacity: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  editAction: { backgroundColor: '#546e7a' },
  deleteAction: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 60, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#444' },
  emptySub: { fontSize: 14, color: '#999', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },

  fab: {
    position: 'absolute', right: 22,
    backgroundColor: '#1a237e', width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', elevation: 10,
    shadowColor: '#1a237e', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 8,
  },
  fabText: { fontSize: 30, color: '#fff', marginTop: -2 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#fff', borderRadius: 24, paddingBottom: 20, width: '100%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: '#64748b', fontWeight: '900' },

  calBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, elevation: 1, borderColor: '#e2e8f0' },
  calBtnText: { fontSize: 12, fontWeight: '800', color: '#1a237e' },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
});
