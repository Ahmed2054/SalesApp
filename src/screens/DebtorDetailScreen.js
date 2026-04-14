import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Share, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { getDebtorById, getPaymentsForDebtor, deleteDebtorPayment } from '../storage/database';

const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function DebtorDetailScreen({ route, navigation }) {
  const { debtorId } = route.params;
  const insets = useSafeAreaInsets();
  const [debtor, setDebtor] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        getDebtorById(debtorId),
        getPaymentsForDebtor(debtorId)
      ]);
      setDebtor(d);
      setPayments(p);
    } catch (e) {
      console.error('[SaleApp] DebtorDetail load error:', e);
      Alert.alert('Error', 'Could not load debtor details.');
    }
  }, [debtorId]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDeletePayment = (payment) => {
    Alert.alert(
      'Delete Payment Collection',
      `Undo this collection of ${fmt(payment.amount)}?\n\nThis will increase the remaining balance owed to you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => { 
            await deleteDebtorPayment(payment.id, debtorId, payment.amount); 
            loadData(); 
          } 
        },
      ]
    );
  };

  if (!debtor) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text>Loading debtor details...</Text>
      </View>
    );
  }

  const isPaid = debtor.balance <= 0;

  const renderRightActions = (payment) => {
    return (
      <View style={styles.swipeActions}>
        <RectButton
          style={[styles.swipeAction, styles.editAction]}
          onPress={() => navigation.navigate('AddDebtorPayment', { 
            debtorId: debtor.id, 
            debtorName: debtor.name, 
            maxAmount: debtor.balance,
            record: payment 
          })}
        >
          <Text style={styles.swipeActionText}>Edit</Text>
        </RectButton>
        <RectButton
          style={[styles.swipeAction, styles.deleteAction]}
          onPress={() => handleDeletePayment(payment)}
        >
          <Text style={styles.swipeActionText}>Delete</Text>
        </RectButton>
      </View>
    );
  };

  const renderPayment = ({ item }) => {
    const dateStr = new Date(item.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const dayStr  = new Date(item.dateISO).toLocaleDateString('en-GB', { weekday: 'long' });

    const buildMsg = () =>
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰  *PAYMENT COLLECTED*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *From:* ${debtor.name}\n` +
      `💵 *Amount Received:* ${fmt(item.amount)}\n` +
      `📅 *Date:* ${dayStr}, ${dateStr}\n` +
      (item.note && item.note !== 'No note' ? `📝 *Note:* ${item.note}\n` : '') +
      `📉 *Remaining Balance:* ${fmt(debtor.balance)}\n` +
      `🔖 *Status:* ${debtor.balance <= 0 ? '✅ FULLY PAID' : '⏳ STILL OWING'}\n` +
      `\n_Sent via SalesApp_`;

    const handleWhatsApp = () => {
      if (!debtor.phone) return;
      const num = debtor.phone.replace(/[^0-9]/g, '');
      const wa  = num.startsWith('0') ? '233' + num.slice(1) : num;
      Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(buildMsg())}`);
    };

    const handleSMS = () => {
      if (!debtor.phone) return;
      // Strip WhatsApp markdown for plain SMS
      const plainMsg = buildMsg()
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1');
      Linking.openURL(`sms:${debtor.phone}?body=${encodeURIComponent(plainMsg)}`);
    };

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <View style={styles.paymentCard}>
          {/* Top row: icon + date/note + amount */}
          <View style={styles.paymentHeader}>
            <View style={styles.paymentIcon}>
              <Text style={{ fontSize: 16 }}>💰</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.paymentDate}>{dateStr}</Text>
              <Text style={styles.paymentNote}>{item.note || 'No note'}</Text>
            </View>
            <Text style={styles.paymentAmount}>{fmt(item.amount)}</Text>
          </View>

          {/* Action pills — only show when debtor has a phone */}
          {!!debtor.phone && (
            <View style={styles.payPillRow}>
              {debtor.isWhatsapp && (
                <TouchableOpacity style={[styles.payPill, styles.payPillWA]} onPress={handleWhatsApp}>
                  <Text style={styles.payPillEmoji}>💬</Text>
                  <Text style={[styles.payPillLabel, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.payPill, styles.payPillSMS]} onPress={handleSMS}>
                <Text style={styles.payPillEmoji}>✉️</Text>
                <Text style={[styles.payPillLabel, { color: '#6a1b9a' }]}>SMS</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Swipeable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      
      {/* ── Summary Header ── */}
      <View style={[styles.header, { paddingTop: 20 }]}>
        <Text style={styles.debtorNameText}>{debtor.name}</Text>
        <View style={styles.contactRow}>
          {!!debtor.phone && (
            <TouchableOpacity 
              style={styles.contactItem} 
              onPress={() => require('react-native').Linking.openURL(`tel:${debtor.phone}`)}
            >
              <Text style={styles.contactText}>📞 {debtor.phone}</Text>
            </TouchableOpacity>
          )}
          {!!debtor.address && (
            <View style={styles.contactItem}>
              <Text style={styles.contactText}>📍 {debtor.address}</Text>
            </View>
          )}
        </View>

        <View style={styles.summaryContainer}>
          <View style={styles.summaryItem}>
             <Text style={styles.summaryLabel}>TOTAL LENT</Text>
             <Text style={styles.summaryValue}>{fmt(debtor.amount)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
             <Text style={[styles.summaryLabel, { color: isPaid ? '#4caf50' : '#bbdefb' }]}>REMAINING</Text>
             <Text style={[styles.summaryValueBig, { color: isPaid ? '#4caf50' : '#fff' }]}>{fmt(debtor.balance)}</Text>
          </View>
        </View>

        {isPaid && (
          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>FULLY COLLECTED 🎉</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Collection History</Text>
          <Text style={styles.sectionCount}>{payments.length} Payments</Text>
        </View>

        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={renderPayment}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0277bd']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⏳</Text>
              <Text style={styles.emptyTitle}>No collections yet</Text>
              <Text style={styles.emptySub}>Record payments from this person here to track their remaining debt.</Text>
            </View>
          }
        />
      </View>

      {/* ── Footer Button ── */}
      <View style={[styles.footer, { paddingBottom: 20 + insets.bottom }]}>
        <TouchableOpacity 
          style={[styles.primaryBtn, isPaid && styles.disabledBtn]} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AddDebtorPayment', { debtorId: debtor.id, debtorName: debtor.name, maxAmount: debtor.balance })}
          disabled={isPaid}
        >
          <Text style={styles.primaryBtnText}>{isPaid ? 'DEBT CLEARED' : 'RECORD PAYMENT COLLECTION'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f7ff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#0277bd',
    paddingHorizontal: 24,
    paddingBottom: 36,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
  },
  debtorNameText: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24, paddingHorizontal: 20 },
  contactItem: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  contactText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 4 },
  summaryValueBig: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 },
  
  paidBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 20,
  },
  paidBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  content: { flex: 1 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: '#0277bd' },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  paymentHeader: { flexDirection: 'row', alignItems: 'center' },
  paymentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f7ff', justifyContent: 'center', alignItems: 'center' },
  paymentDate: { fontSize: 14, fontWeight: '800', color: '#333' },
  paymentNote: { fontSize: 12, color: '#777', marginTop: 2 },
  paymentAmount: { fontSize: 16, fontWeight: '900', color: '#0277bd' },

  payPillRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  payPill:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  payPillWA:  { backgroundColor: '#e8f5e9' },
  payPillSMS: { backgroundColor: '#f3e5f5' },
  payPillEmoji:{ fontSize: 13 },
  payPillLabel:{ fontSize: 11, fontWeight: '800' },
  
  swipeActions: { flexDirection: 'row', width: 140, marginBottom: 12 },
  swipeAction: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 16, marginLeft: 8 },
  editAction: { backgroundColor: '#4caf50' }, // Using Green for Edit on Debtors for variety or match colors? Let's use blue for consistency with CreditorEdit.
  deleteAction: { backgroundColor: '#c62828' },
  swipeActionText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 50, marginBottom: 12, opacity: 0.5 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#555' },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 18 },

  footer: { paddingHorizontal: 20, backgroundColor: 'transparent' },
  primaryBtn: {
    backgroundColor: '#0277bd',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#0277bd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabledBtn: { backgroundColor: '#ccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
});
