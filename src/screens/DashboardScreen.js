import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, FlatList, Animated, DeviceEventEmitter, Modal, LayoutAnimation, Platform
} from 'react-native';
import { checkForUpdates } from '../utils/updateHelper';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSalesStats, getSavingsStats, getPeriodSummaryStats, getRecentActivity, getCreditorStats, getDebtorStats, getSetting } from '../storage/database';
import { usePeriod } from '../context/PeriodContext';

const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

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
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  triggerText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  arrow:       { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '900' },
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
  optionText:   { flex: 1, fontSize: 15, color: '#333' },
  optionTextActive: { color: '#0d47a1', fontWeight: '700' },
  check: { fontSize: 14, color: '#1a237e', fontWeight: '900' },
});

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // ── Layout Logic ──
  const [businessName, setBusinessName] = useState('User');
  const [dashboardStyle, setDashboardStyle] = useState('flipping'); // flipping | scrolling | static
  const { selectedYear, setSelectedYear, selectedMonth, setSelectedMonth } = usePeriod();
  const [showQuickActions, setShowQuickActions] = useState(true);
  
  // Scroller refs
  const scrollRef = useRef(null);
  const scrollX = useRef(0);
  const [isPaused, setIsPaused] = useState(false);
  const [balanceIndex, setBalanceIndex] = useState(0); 
  const [manualActionsAnim] = useState(new Animated.Value(1)); // kept for compat but no longer drives height

  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [salesStats, savingStats, summary, recent, creditorStats, debtorStats, name, dStyle] = await Promise.all([
        getSalesStats(selectedYear, selectedMonth),
        getSavingsStats(selectedYear, selectedMonth),
        getPeriodSummaryStats(selectedYear, selectedMonth),
        getRecentActivity(10, selectedYear, selectedMonth),
        getCreditorStats(),
        getDebtorStats(),
        getSetting('business_name', 'User'),
        getSetting('dashboard_ticker_style', 'flipping'),
      ]);
      setData({ salesStats, savingStats, summary, recent, creditorStats, debtorStats });
      setBusinessName(name);
      setDashboardStyle(dStyle);
    } catch (e) {
      console.error('[Sales App] Dashboard load error:', e);
    }
  }, [selectedYear, selectedMonth]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    load();
  }, [load, selectedYear, selectedMonth]);

  useEffect(() => {
    // Automatic update check on app start
    checkForUpdates(true);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('db_restored', load);
    return () => sub.remove();
  }, [load]);

  const balanceItems = [
    { label: 'Total Sales Balance', value: data?.salesStats?.totalAmount ?? 0, color: '#1a237e', icon: <MaterialIcons name="shopping-bag" size={14} color="#fff" /> },
    { label: 'Personal Savings Balance', value: data?.savingStats?.balance ?? 0, color: '#00695c', icon: <MaterialCommunityIcons name="bank" size={14} color="#fff" /> },
    { label: 'Total Creditors Balance', value: data?.creditorStats?.totalOwed ?? 0, color: '#b71c1c', icon: <MaterialCommunityIcons name="handshake" size={14} color="#fff" /> },
    { label: 'Total Debtors Balance', value: data?.debtorStats?.totalOwed ?? 0, color: '#0277bd', icon: <MaterialCommunityIcons name="card-text-outline" size={14} color="#fff" /> }
  ];

  const manuallyFlip = useCallback((dir = 1) => {
    fadeAnim.stopAnimation();
    slideAnim.stopAnimation();

    const exitOffset = dir > 0 ? -30 : 30; // Slide OUT to the left if next, to the right if prev
    const enterOffset = dir > 0 ? 30 : -30; // Slide IN from the right if next, from the left if prev

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: exitOffset, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setBalanceIndex((prev) => (prev + dir + balanceItems.length) % balanceItems.length);
      slideAnim.setValue(enterOffset);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [balanceIndex, balanceItems.length]);

  useEffect(() => {
    let interval;
    if (dashboardStyle === 'scrolling' && !isPaused && data) {
      interval = setInterval(() => {
        scrollX.current += 1;
        if (scrollX.current >= 1216) scrollX.current = 0;
        scrollRef.current?.scrollTo({ x: scrollX.current, animated: false });
      }, 40); 
    } 
    else if (dashboardStyle === 'flipping' && data) {
      interval = setInterval(() => {
        manuallyFlip(1);
      }, 6000);
    }
    // Note: if dashboardStyle === 'static', no interval is created
    return () => clearInterval(interval);
  }, [isPaused, data, dashboardStyle, manuallyFlip]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleActions = () => {
    if (Platform.OS === 'android') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowQuickActions(prev => !prev);
  };



  if (!data) return null;

  const renderActivity = ({ item }) => {
    let icon, label, bgColor, textColor;
    
    if (item.kind === 'saving') {
      icon = <MaterialCommunityIcons name="bank" size={20} color="#00695c" />;
      label = 'Savings History';
      bgColor = '#e0f2f1';
      textColor = '#00695c';
    } else if (item.kind === 'creditor') {
      icon = <MaterialCommunityIcons name="handshake" size={20} color="#b71c1c" />;
      label = 'Debt Repayment';
      bgColor = '#fdf0f0';
      textColor = '#b71c1c';
    } else if (item.kind === 'debtor') {
      icon = <Ionicons name="person" size={20} color="#0277bd" />;
      label = 'Debt Collection';
      bgColor = '#f0f7ff';
      textColor = '#0277bd';
    } else {
      icon = <MaterialIcons name="shopping-bag" size={20} color="#1a237e" />;
      label = 'Sales History';
      bgColor = '#e8eaf6';
      textColor = '#1a237e';
    }

    return (
      <View style={styles.activityCard}>
        <View style={[styles.activityIcon, { backgroundColor: bgColor }]}>
          {icon}
        </View>
        <View style={styles.activityInfo}>
          <Text style={[styles.activityKind, { color: textColor }]}>{label}</Text>
          <Text style={styles.activityNote} numberOfLines={1}>{item.note || 'No note'}</Text>
        </View>
        <Text style={[styles.activityAmount, { color: textColor }]}>
          {fmt(item.amount)}
        </Text>
      </View>
    );
  };





  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1a237e']} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Unified Scrolling Header Block ── */}
        <View style={[styles.fixedHeader, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.businessName}>{businessName}</Text>
            <View style={styles.headerIndicator} />

            {/* Period Selectors */}
            <View style={styles.periodRow}>
              <Dropdown
                label="Year"
                value={selectedYear}
                options={YEARS}
                onSelect={setSelectedYear}
              />
              <Dropdown
                label="Month"
                value={selectedMonth}
                options={[-1, ...MONTHS.map((_, i) => i)]}
                onSelect={setSelectedMonth}
                renderLabel={(i) => i === -1 ? 'All Months' : MONTHS[i]}
              />
            </View>

            {/* ── Ticker / Flipper Section ── */}
            <View style={styles.integratedTickerSection}>
              <Text style={styles.headerSub}>{dashboardStyle === 'scrolling' ? 'Live Financial Ticker' : 'Financial Snapshot'}</Text>

              <View style={styles.tickerContainer}>
                {dashboardStyle === 'scrolling' ? (
                  <ScrollView
                    ref={scrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    onScrollBeginDrag={() => setIsPaused(true)}
                    onScrollEndDrag={() => setIsPaused(false)}
                    scrollEventThrottle={16}
                    style={{ height: '100%' }}
                    contentContainerStyle={styles.tickerAnimatedRow}
                  >
                    {[1, 2, 3].map((_, i) => ( // Duplicate cards for wrap-around feeling
                      <View key={i} style={styles.tickerGroup}>
                        {balanceItems.map((item, idx) => (
                          <View key={idx} style={styles.tickerCard}>
                            <View style={[styles.tickerIndicatorBar, { backgroundColor: item.color }]} />
                            <View style={styles.tickerCardContent}>
                               <View style={styles.tickerContentRow}>
                                   <View style={[styles.tickerIconSmall, { backgroundColor: item.color }]}>
                                      {item.icon}
                                   </View>
                                  <View style={{ flex: 1, marginLeft: 12 }}>
                                     <Text style={styles.tickerCardLabel}>{item.label}</Text>
                                     <Text style={styles.tickerCardValue}>{fmt(item.value)}</Text>
                                  </View>
                               </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={styles.flipArrow} onPress={() => manuallyFlip(-1)}>
                      <Text style={styles.flipArrowText}>{"<"}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      activeOpacity={0.9} 
                      onPress={() => manuallyFlip(1)} 
                      style={{ flex: 1 }}
                    >
                      <Animated.View style={[
                        styles.tickerCard, 
                        { 
                          width: '100%', 
                          marginHorizontal: 0,
                          opacity: fadeAnim, 
                          transform: [{ translateX: slideAnim }] 
                        }
                      ]}>
                        <View style={[styles.tickerIndicatorBar, { backgroundColor: balanceItems[balanceIndex].color }]} />
                        <View style={styles.tickerCardContent}>
                           <View style={styles.tickerContentRow}>
                              <View style={[styles.tickerIconSmall, { backgroundColor: balanceItems[balanceIndex].color }]}>
                                 {balanceItems[balanceIndex].icon}
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                 <Text style={styles.tickerCardLabel}>{balanceItems[balanceIndex].label}</Text>
                                 <Text style={[styles.tickerCardValue, { fontSize: 24, textAlign: 'left' }]}>{fmt(balanceItems[balanceIndex].value)}</Text>
                              </View>
                           </View>
                        </View>
                      </Animated.View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.flipArrow} onPress={() => manuallyFlip(1)}>
                      <Text style={styles.flipArrowText}>{">"}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
        </View>

        {/* ── Quick Actions ── */}
        <View>
          <TouchableOpacity
            style={styles.sectionHeaderToggle}
            activeOpacity={0.7}
            onPress={toggleActions}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="bolt" size={20} color="#1e293b" />
              <Text style={styles.sectionTitle}>Quick Actions</Text>
            </View>
            <Text style={[styles.toggleIcon, { transform: [{ rotate: showQuickActions ? '0deg' : '180deg' }] }]}>
              ▾
            </Text>
          </TouchableOpacity>

          {showQuickActions && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={[styles.actionScroll, { height: '100%' }]}
              style={[styles.actionScrollContainer, { marginBottom: 10 }]}
            >
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Sales')}>
                <View style={[styles.actionIcon, { backgroundColor: '#1a237e' }]}>
                  <MaterialIcons name="shopping-bag" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Sales</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Savings')}>
                <View style={[styles.actionIcon, { backgroundColor: '#00695c' }]}>
                  <MaterialCommunityIcons name="bank" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Savings</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Creditors')}>
                <View style={[styles.actionIcon, { backgroundColor: '#b71c1c' }]}>
                  <MaterialCommunityIcons name="handshake" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Creditors</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Debtors')}>
                <View style={[styles.actionIcon, { backgroundColor: '#0277bd' }]}>
                  <MaterialCommunityIcons name="card-text-outline" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Debtors</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>



        {/* ── Recent Transactions ── */}
        <View style={styles.section}>
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>Recent Activity ({data.recent.length})</Text>
          </View>
          {data.recent.length === 0 ? (
            <Text style={styles.emptyText}>No activity recorded yet.</Text>
          ) : (
            data.recent.map((item, i) => (
              <View key={item.id + (item.kind || i)}>{renderActivity({ item })}</View>
            ))
          )}
        </View>

      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  fixedHeader: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 24,
    paddingBottom: 15,
    alignItems: 'center',
    zIndex: 10,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    width: '100%',
  },
  integratedTickerSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  greetingHello: { fontSize: 16, color: '#90caf9', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  businessName: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: -2, textAlign: 'center' },
  headerIndicator: { width: 30, height: 4, backgroundColor: '#3b82f6', borderRadius: 2, marginTop: 12, marginBottom: 12 },
  headerSub: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' },
  
  tickerContainer: {
    height: 90,
    marginTop: 20,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  tickerAnimatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  tickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    width: 280,
    height: 80,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    alignItems: 'center',
  },
  tickerIndicatorBar: {
    width: 8,
    height: '100%',
  },
  tickerCardContent: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  tickerContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tickerEmojiSmall: {
    fontSize: 14,
  },
  tickerCardLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tickerCardValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '900',
    marginTop: 2,
  },
  flipArrow: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipArrowText: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '300',
  },

  actionScrollContainer: { marginTop: 0, flexGrow: 0 },
  actionScroll: { paddingHorizontal: 24, paddingBottom: 10, gap: 14 },
  actionBtn: { 
    width: 105, 
    backgroundColor: '#fff', 
    borderRadius: 24, 
    padding: 16, 
    alignItems: 'center', 
    elevation: 8, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.12, 
    shadowRadius: 12 
  },
  actionIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionEmoji: { fontSize: 22 },
  actionText: { fontSize: 14, fontWeight: '800', color: '#1e293b' },

  section: { paddingHorizontal: 24, marginTop: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  
  sectionHeaderToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    marginTop: 20,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  toggleIcon: {
    fontSize: 20,
    color: '#3b82f6',
    fontWeight: '900',
  },
  
  snapshotRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 24, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  snapshotItem: { flex: 1, alignItems: 'center' },
  snapshotLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', marginBottom: 6 },
  snapshotValue: { fontSize: 18, fontWeight: '900' },
  snapshotDivider: { width: 1, backgroundColor: '#f1f5f9', marginVertical: 4 },

  monthCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 24, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  monthCol: { flex: 1, alignItems: 'center' },
  monthVal: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  monthLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' },

  activityCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 12, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.03 },
  activityIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  activityInfo: { flex: 1 },
  activityKind: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  activityNote: { fontSize: 15, color: '#475569', fontWeight: '600', marginTop: 3 },
  activityAmount: { fontSize: 15, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 14, color: '#94a3b8', marginVertical: 30, fontStyle: 'italic' },
});
