import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, SafeAreaView, ScrollView, RefreshControl, Share, Linking, Modal, Platform } from 'react-native';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);

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

  const confirmShare = async (type) => {
    if (!selectedPayment || !creditor) return;
    
    const dateStr = new Date(selectedPayment.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const dayStr  = new Date(selectedPayment.dateISO).toLocaleDateString('en-GB', { weekday: 'long' });

    const msg =
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸  *PAYMENT MADE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *To:* ${creditor.name}\n` +
      `💵 *Amount Paid:* ${fmt(selectedPayment.amount)}\n` +
      `📅 *Date:* ${dayStr}, ${dateStr}\n` +
      (selectedPayment.note && selectedPayment.note !== 'No note' ? `📝 *Note:* ${selectedPayment.note}\n` : '') +
      `📉 *Remaining Balance:* ${fmt(creditor.balance)}\n` +
      `🔖 *Status:* ${creditor.balance <= 0 ? '✅ FULLY CLEARED' : '⏳ STILL OWING'}\n` +
      `\n_Sent via SalesApp_`;

    setShareModalVisible(false);

    if (type === 'whatsapp') {
      const num = creditor.phone.replace(/[^0-9]/g, '');
      const wa  = num.startsWith('0') ? '233' + num.slice(1) : num;
      Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
    } else if (type === 'sms') {
      const plainMsg = msg.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1');
      Linking.openURL(`sms:${creditor.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(plainMsg)}`);
    } else {
      await Share.share({ message: msg });
    }
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
    const dateStr = new Date(item.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const dayStr  = new Date(item.dateISO).toLocaleDateString('en-GB', { weekday: 'long' });

    const handleShare = () => {
      setSelectedPayment(item);
      setShareModalVisible(true);
    };

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <View style={styles.paymentCard}>
          {/* Top row: icon + date/note + amount */}
          <View style={styles.paymentHeader}>
            <View style={styles.paymentIcon}>
              <MaterialCommunityIcons name="cash-minus" size={20} color="#b71c1c" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.paymentDate}>{dateStr}</Text>
              <Text style={styles.paymentNote}>{item.note || 'No note'}</Text>
            </View>
            <Text style={styles.paymentAmount}>{fmt(item.amount)}</Text>
          </View>

          {/* Action pills */}
          <View style={styles.payPillRow}>
            <TouchableOpacity style={[styles.payPill, styles.payPillShare]} onPress={handleShare}>
              <Ionicons name="share-social" size={14} color="#e65100" style={{ marginRight: 4 }} />
              <Text style={[styles.payPillLabel, { color: '#e65100' }]}>Share Payment</Text>
            </TouchableOpacity>
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
              style={[styles.contactItem, { flexDirection: 'row', alignItems: 'center' }]} 
              onPress={() => Linking.openURL(`tel:${creditor.phone}`)}
            >
              <Ionicons name="call" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.contactText}>{creditor.phone}</Text>
            </TouchableOpacity>
          )}
          {!!creditor.address && (
            <View style={[styles.contactItem, { flexDirection: 'row', alignItems: 'center' }]}>
              <Ionicons name="location" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.contactText}>{creditor.address}</Text>
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
          <View style={[styles.paidBadge, { flexDirection: 'row', alignItems: 'center' }]}>
            <MaterialCommunityIcons name="party-popper" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.paidBadgeText}>FULLY PAID</Text>
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
              <Ionicons name="time-outline" size={60} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptySub}>When you pay this creditor, record it here to track the balance.</Text>
            </View>
          }
        />
      </View>

      {/* ── Share Menu Modal ── */}
      <Modal visible={shareModalVisible} transparent animationType="fade" onRequestClose={() => setShareModalVisible(false)}>
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShareModalVisible(false)}
        >
          <View style={styles.shareMenu}>
            <Text style={styles.shareMenuTitle}>Share Payment Via</Text>
            
            {!!creditor?.phone && (
              <>
                <TouchableOpacity style={styles.shareOption} onPress={() => confirmShare('whatsapp')}>
                  <View style={[styles.shareIcon, { backgroundColor: '#e8f5e9' }]}>
                    <FontAwesome name="whatsapp" size={24} color="#25D366" />
                  </View>
                  <Text style={styles.shareActionLabel}>WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareOption} onPress={() => confirmShare('sms')}>
                  <View style={[styles.shareIcon, { backgroundColor: '#f3e5f5' }]}>
                    <MaterialIcons name="sms" size={24} color="#7b1fa2" />
                  </View>
                  <Text style={styles.shareActionLabel}>SMS Message</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.shareOption} onPress={() => confirmShare('general')}>
              <View style={[styles.shareIcon, { backgroundColor: '#fff3e0' }]}>
                <Ionicons name="share-social" size={24} color="#e65100" />
              </View>
              <Text style={styles.shareActionLabel}>Other Apps</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareCancel} onPress={() => setShareModalVisible(false)}>
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

  payPillRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  payPill:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  payPillWA:  { backgroundColor: '#e8f5e9' },
  payPillSMS: { backgroundColor: '#f3e5f5' },
  payPillEmoji:{ fontSize: 13 },
  payPillLabel:{ fontSize: 11, fontWeight: '800' },
  
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

  // Share Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareMenu: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  shareMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
    textAlign: 'center',
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  shareIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  shareActionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  shareCancel: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareCancelText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748b',
  },
  payPillShare: { backgroundColor: '#fff3e0' },
});
