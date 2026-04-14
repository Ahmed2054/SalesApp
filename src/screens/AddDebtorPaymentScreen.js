import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { insertDebtorPayment, updateDebtorPayment } from '../storage/database';
import { v4 as uuidv4 } from 'uuid';

const fmt = (n) =>
  `GHS ${parseFloat(n || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default function AddDebtorPaymentScreen({ route, navigation }) {
  const { debtorId, debtorName, maxAmount, record } = route.params;
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const noteRef = useRef(null);

  useEffect(() => {
    if (record) {
      setAmount(String(record.amount));
      setNote(record.note || '');
      if (record.dateISO) setDate(new Date(record.dateISO));
    }
  }, [record]);

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      return Alert.alert('Invalid Amount', 'Please enter a valid amount.');
    }

    // Adjust max check for editing
    const oldAmt = record ? record.amount : 0;
    const limit = maxAmount + oldAmt;

    if (num > limit) {
       Alert.alert(
         'Confirm Excess Collection',
         `This collection (${fmt(num)}) is greater than the remaining balance (${fmt(limit)}). Continue?`,
         [
           { text: 'Cancel', style: 'cancel' },
           { text: 'Yes, Record Excess', onPress: proceed }
         ]
       );
       return;
    }

    proceed();
  };

  const proceed = async () => {
    setLoading(true);
    try {
      const now = new Date();
      if (record) {
        await updateDebtorPayment({
          id: record.id,
          debtorId,
          amount: parseFloat(amount),
          oldAmount: record.amount,
          dateISO: date.toISOString(),
          note
        });
      } else {
        await insertDebtorPayment({
          id: uuidv4(),
          debtorId,
          amount: parseFloat(amount),
          dateISO: date.toISOString(),
          note,
          recordedAt: now.toISOString()
        });
      }
      navigation.goBack();
    } catch (e) {
      console.error('[SaleApp] AddDebtorPayment error:', e);
      Alert.alert('Error', 'Could not save collection record.');
    } finally {
      setLoading(false);
    }
  };
   
  // Update button text in the render section below

  const formatDateFriendly = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.root} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debtor Info</Text>
          <View style={styles.card}>
             <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Collecting From</Text>
                <Text style={styles.infoName}>{debtorName}</Text>
             </View>
             <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 12, paddingTop: 12 }]}>
                <Text style={styles.infoLabel}>Remaining Debt Owed</Text>
                <Text style={[styles.infoName, { fontSize: 18 }]}>{fmt(maxAmount)}</Text>
             </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collection Details</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <MaterialCommunityIcons name="cash-check" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Amount Collected (GH₵)</Text>
              </View>
              <TextInput
                style={[styles.input, { fontSize: 20, fontWeight: '800', color: '#0277bd' }]}
                placeholder="0.00"
                placeholderTextColor="#0277bd1a"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => noteRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Ionicons name="calendar-outline" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Date Received</Text>
              </View>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateText}>{formatDateFriendly(date)}</Text>
                  <Text style={styles.dateDay}>{date.toLocaleDateString('en-GB', { weekday: 'long' })}</Text>
                </View>
                <View style={styles.calendarIconBg}>
                  <Ionicons name="calendar" size={18} color="#0277bd" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Context</Text>
          <View style={styles.card}>
            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Ionicons name="document-text-outline" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Note / Details</Text>
              </View>
              <TextInput
                ref={noteRef}
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="e.g. Cash received, bank transfer..."
                placeholderTextColor="#e2e8f0"
                value={note}
                onChangeText={setNote}
                multiline
                returnKeyType="done"
                onSubmitEditing={handleSave}
                blurOnSubmit={true}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveBtn, loading && styles.disabled]} 
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveBtnText}>{loading ? 'SAVING...' : 'Confirm Collection Record'}</Text>
        </TouchableOpacity>

      </ScrollView>

      {showPicker && (
        <View style={styles.iosPickerWrap}>
          <View style={styles.iosPickerCard}>
            <View style={styles.iosPickerHeader}>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={styles.iosPickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onDateChange}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16, paddingTop: 10 },
  
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  field: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldIcon: { fontSize: 13, marginRight: 8, color: '#94a3b8' },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  input: { fontSize: 16, color: '#1e293b', fontWeight: '600', padding: 0 },
  
  infoRow: { paddingVertical: 12 },
  infoLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  infoName: { fontSize: 24, fontWeight: '900', color: '#0277bd' },

  dateBtn: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  dateDay: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  calendarIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#e1f5fe', justifyContent: 'center', alignItems: 'center' },
  dateIcon: { fontSize: 18 },

  saveBtn: { backgroundColor: '#0277bd', borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 10, elevation: 4, shadowColor: '#0277bd', shadowOpacity: 0.3, shadowRadius: 10 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  iosPickerWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  iosPickerCard: { width: '90%', backgroundColor: '#fff', borderRadius: 24, paddingBottom: 20, overflow: 'hidden' },
  iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iosPickerDone: { color: '#0277bd', fontWeight: '800', fontSize: 16 },
});
