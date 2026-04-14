import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { insertSale, updateSale } from '../storage/database';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d) {
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AddSaleScreen({ navigation, route }) {
  const editing = route?.params?.record ?? null;
  const initialDateISO = route?.params?.initialDateISO;

  const today = new Date();
  const [amount,        setAmount]        = useState('');
  const [type,          setType]          = useState('deposit'); 
  const [date,          setDate]          = useState(formatDate(initialDateISO ? new Date(initialDateISO) : today));
  const [dateISO,       setDateISO]       = useState(initialDateISO ? new Date(initialDateISO).toISOString() : today.toISOString());
  const [pickerDate,    setPickerDate]    = useState(initialDateISO ? new Date(initialDateISO) : today);
  const [note,          setNote]          = useState('');
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [saving,        setSaving]        = useState(false);

  const noteRef = React.useRef(null);

  useEffect(() => {
    if (editing) {
      setAmount(String(editing.amount));
      setType(editing.type || 'deposit');
      setDate(editing.date);
      const iso = editing.dateISO || today.toISOString();
      setDateISO(iso);
      setPickerDate(new Date(iso));
      setNote(editing.note || '');
    }
  }, [editing]);

  const formatDateFriendly = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const applyDate = (d) => {
    if (!d) return;
    setPickerDate(d);
    setDate(formatDate(d));
    setDateISO(d.toISOString());
  };

  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value:       pickerDate,
        mode:        'date',
        display:     'calendar',
        minimumDate: new Date(2000, 0, 1),
        maximumDate: new Date(2099, 11, 31),
        onChange:    (event, selected) => {
          if (event.type === 'set' && selected) applyDate(selected);
        },
      });
    } else {
      setShowIOSPicker(true);
    }
  };

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        id:         editing ? editing.id : uuidv4(),
        amount:     parsed,
        type,
        date,
        dateISO,
        note:       note.trim(),
        recordedAt: new Date().toISOString(),
      };
      if (editing) {
        await updateSale(record);
      } else {
        await insertSale(record);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 90 : 0}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction Type</Text>
          <View style={styles.typeRow}>
             <TouchableOpacity 
               style={[styles.typeBtn, type === 'deposit' && styles.typeBtnActiveDeposit]} 
               onPress={() => setType('deposit')}
             >
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                 <MaterialCommunityIcons name="cash-plus" size={16} color={type === 'deposit' ? '#1e293b' : '#94a3b8'} />
                 <Text style={[styles.typeBtnText, type === 'deposit' && styles.typeBtnTextActive]}>Deposit</Text>
               </View>
             </TouchableOpacity>
             <TouchableOpacity 
               style={[styles.typeBtn, type === 'withdrawal' && styles.typeBtnActiveWithdraw]} 
               onPress={() => setType('withdrawal')}
             >
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                 <MaterialCommunityIcons name="cash-minus" size={16} color={type === 'withdrawal' ? '#1e293b' : '#94a3b8'} />
                 <Text style={[styles.typeBtnText, type === 'withdrawal' && styles.typeBtnTextActive]}>Withdrawal</Text>
               </View>
             </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Details</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <MaterialIcons name="attach-money" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Amount (GH₵)</Text>
              </View>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#1a237e1a"
                  keyboardType="decimal-pad"
                  autoFocus={!editing}
                  returnKeyType="next"
                  onSubmitEditing={() => noteRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Ionicons name="calendar-outline" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Transaction Date</Text>
              </View>
              <TouchableOpacity style={styles.datePickerBtn} onPress={openCalendar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.datePickerText}>{formatDateFriendly(dateISO)}</Text>
                  <Text style={styles.datePickerDay}>{new Date(dateISO).toLocaleDateString('en-GB', { weekday: 'long' })}</Text>
                </View>
                <View style={styles.calendarIconBg}>
                  <Ionicons name="calendar" size={18} color="#1a237e" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showIOSPicker && Platform.OS === 'ios' && (
          <View style={styles.iosPickerWrap}>
            <View style={styles.iosPickerCard}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShowIOSPicker(false)}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                onChange={(event, selected) => { if (selected) applyDate(selected); }}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Info</Text>
          <View style={styles.card}>
            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Ionicons name="document-text-outline" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.label}>Note / Description</Text>
              </View>
              <TextInput
                ref={noteRef}
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Details about this entry..."
                placeholderTextColor="#e2e8f0"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                returnKeyType="done"
                onSubmitEditing={handleSave}
                blurOnSubmit={true}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
          onPress={handleSave} 
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : editing ? 'Update Record' : 'Confirm Transaction'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16, paddingTop: 10, paddingBottom: 60 },
  
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  
  typeRow: { flexDirection: 'row', gap: 12 },
  typeBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  typeBtnActiveDeposit: { borderColor: '#addfad', backgroundColor: '#f0fdf4' },
  typeBtnActiveWithdraw: { borderColor: '#ffd0d0', backgroundColor: '#fef2f2' },
  typeBtnText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  typeBtnTextActive: { color: '#1e293b', fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  field: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldIcon: { fontSize: 13, marginRight: 8, color: '#94a3b8' },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  
  inputWrap: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '800', color: '#1a237e', padding: 0 },
  
  datePickerBtn: { flexDirection: 'row', alignItems: 'center' },
  datePickerText: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  datePickerDay: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  calendarIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0f4ff', justifyContent: 'center', alignItems: 'center' },
  datePickerIcon: { fontSize: 18 },

  noteInput: { fontSize: 15, color: '#1e293b', padding: 0, minHeight: 60, fontWeight: '500' },

  iosPickerWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  iosPickerCard: { width: '90%', backgroundColor: '#fff', borderRadius: 24, paddingBottom: 20, overflow: 'hidden' },
  iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iosPickerDone: { color: '#1a237e', fontWeight: '800', fontSize: 16 },

  saveBtn: { backgroundColor: '#1a237e', borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 10, elevation: 4, shadowColor: '#1a237e', shadowOpacity: 0.3, shadowRadius: 10 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
