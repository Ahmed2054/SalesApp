import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, SafeAreaView, ScrollView, RefreshControl, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { getCreditorById, getPaymentsForCreditor, deleteCreditorPayment } from '../storage/database';

const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function CreditorDetailScreen({ route, navigation }) {
  const { creditorId } = route.params;
  const insets = useSafeAreaInsets();
  const [creditor, setCreditor] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        getCreditorById(creditorId),
        getPaymentsForCreditor(creditorId)
      ]);
      setCreditor(c);
      setPayments(p);
    } catch (e) {
      console.error('[SaleApp] CreditorDetail load error:', e);
      Alert.alert('Error', 'Could not load creditor details.');
    }
  }, [creditorId]);

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
      'Delete Payment',
      `Undo this payment of ${fmt(payment.amount)}?\n\nThis will increase the remaining balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => { 
            await deleteCreditorPayment(payment.id, creditorId, payment.amount); 
            loadData(); 
          } 
        },
      ]
    );
  };

  if (!creditor) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text>Loading creditor details...</Text>
      </View>
    );
  }

  const isPaid = creditor.balance <= 0;

  const renderRightActions = (payment) => {
    return (
      <View style={styles.swipeActions}>
        <RectButton
          style={[styles.swipeAction, styles.editAction]}
          onPress={() => navigation.navigate('AddCreditorPayment', { 
            creditorId: creditor.id, 
            creditorName: creditor.name, 
            maxAmount: creditor.balance,
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
    const handleSharePayment = async () => {
      const dateStr = new Date(item.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const msg =
        `💸 PAYMENT RECORD\n` +
        `Creditor: ${creditor.name}\n` +
        `Amount Paid: ${fmt(item.amount)}\n` +
        `Date: ${dateStr}\n` +
        (item.note && item.note !== 'No note' ? `Note: ${item.note}\n` : '') +
        `\n— Shared from SalesApp`;
      await Share.share({ message: msg });
    };

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <View style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <View style={styles.paymentIcon}>
              <Text style={{ fontSize: 16 }}>💸</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.paymentDate}>{new Date(item.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Text style={styles.paymentNote}>{item.note || 'No note'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.paymentAmount}>{fmt(item.amount)}</Text>
              <TouchableOpacity style={styles.sharePayBtn} onPress={handleSharePayment}>
                <Text style={styles.sharePayBtnText}>📤 Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Swipeable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      
      {/* ── Summary Header ── */}
      <View style={[styles.header, { paddingTop: 20 }]}>
        <Text style={styles.creditorNameText}>{creditor.name}</Text>
        <View style={styles.contactRow}>
          {!!creditor.phone && (
            <TouchableOpacity 
              style={styles.contactItem} 
              onPress={() => require('react-native').Linking.openURL(`tel:${creditor.phone}`)}
            >
              <Text style={styles.contactText}>📞 {creditor.phone}</Text>
            </TouchableOpacity>
          )}
          {!!creditor.address && (
            <View style={styles.contactItem}>
              <Text style={styles.contactText}>📍 {creditor.address}</Text>
            </View>
          )}
        </View>

        <View style={styles.summaryContainer}>
          <View style={styles.summaryItem}>
             <Text style={styles.summaryLabel}>TOTAL DEBT</Text>
             <Text style={styles.summaryValue}>{fmt(creditor.amount)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
             <Text style={[styles.summaryLabel, { color: isPaid ? '#4caf50' : '#ffcdd2' }]}>REMAINING</Text>
             <Text style={[styles.summaryValueBig, { color: isPaid ? '#4caf50' : '#fff' }]}>{fmt(creditor.balance)}</Text>
          </View>
        </View>

        {isPaid && (
          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>FULLY PAID 🎉</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Payment History</Text>
          <Text style={styles.sectionCount}>{payments.length} Payments</Text>
        </View>

        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={renderPayment}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#b71c1c']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⌛</Text>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptySub}>When you pay this creditor, record it here to track the balance.</Text>
            </View>
          }
        />
      </View>

      {/* ── Footer Button ── */}
      <View style={[styles.footer, { paddingBottom: 20 + insets.bottom }]}>
        <TouchableOpacity 
          style={[styles.primaryBtn, isPaid && styles.disabledBtn]} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AddCreditorPayment', { creditorId: creditor.id, creditorName: creditor.name, maxAmount: creditor.balance })}
          disabled={isPaid}
        >
          <Text style={styles.primaryBtnText}>{isPaid ? 'DEBT CLEARED' : 'RECORD NEW PAYMENT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fdf0f0' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#b71c1c',
    paddingHorizontal: 24,
    paddingBottom: 36,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
  },
  creditorNameText: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
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
  sectionLabel: { fontSize: 13, fontWeight: '900', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: '#b71c1c' },

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
  paymentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fdf0f0', justifyContent: 'center', alignItems: 'center' },
  paymentDate: { fontSize: 14, fontWeight: '800', color: '#333' },
  paymentNote: { fontSize: 12, color: '#777', marginTop: 2 },
  paymentAmount: { fontSize: 16, fontWeight: '900', color: '#b71c1c' },

  sharePayBtn: { backgroundColor: '#fce4ec', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  sharePayBtnText: { fontSize: 11, fontWeight: '800', color: '#b71c1c' },
  
  swipeActions: { flexDirection: 'row', width: 140, marginBottom: 12 },
  swipeAction: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 16, marginLeft: 8 },
  editAction: { backgroundColor: '#0277bd' },
  deleteAction: { backgroundColor: '#b71c1c' },
  swipeActionText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 50, marginBottom: 12, opacity: 0.5 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#555' },
  emptySub: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 18 },

  footer: { paddingHorizontal: 20, backgroundColor: 'transparent' },
  primaryBtn: {
    backgroundColor: '#b71c1c',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#b71c1c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabledBtn: { backgroundColor: '#ccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
});
