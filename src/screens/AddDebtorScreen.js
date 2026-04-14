import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { insertDebtor, updateDebtor } from '../storage/database';

export default function AddDebtorScreen({ navigation, route }) {
  const editing = route?.params?.record ?? null;
  const today = new Date().toISOString().split('T')[0];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isWhatsapp, setIsWhatsapp] = useState(false);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [duedate, setDuedate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const amountRef = useRef(null);
  const noteRef = useRef(null);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPhone(editing.phone || '');
      setIsWhatsapp(editing.isWhatsapp || false);
      setAddress(editing.address || '');
      setAmount(String(editing.amount));
      setDuedate(editing.duedate || today);
      setNote(editing.note || '');
      if (editing.duedate) setPickerDate(new Date(editing.duedate));
    }
  }, [editing]);

  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerDate,
        mode: 'date',
        display: 'calendar',
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) {
            setPickerDate(selected);
            setDuedate(selected.toISOString().split('T')[0]);
          }
        },
      });
    } else {
      setShowIOSPicker(true);
    }
  };

  const handleSave = async () => {
    const parsedAmt = parseFloat(amount);
    if (!name || isNaN(parsedAmt)) {
      Alert.alert('Invalid Data', 'Please provide a name and valid amount.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        id: editing ? editing.id : uuidv4(),
        name: name.trim(),
        phone: phone.trim(),
        isWhatsapp,
        address: address.trim(),
        amount: parsedAmt,
        balance: editing ? editing.balance : parsedAmt,
        duedate,
        note: note.trim(),
        recordedAt: new Date().toISOString(),
      };
      if (editing) {
        await updateDebtor(record);
      } else {
        await insertDebtor(record);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const formatDateFriendly = (iso) => {
    if (!iso) return 'Select Date';
    return new Date(iso).toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debtor Identity</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldIcon}>👤</Text>
                <Text style={styles.label}>Full Name</Text>
              </View>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. John Doe"
                placeholderTextColor="#e2e8f0"
                autoFocus={!editing}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldIcon}>📞</Text>
                <Text style={styles.label}>Telephone Number</Text>
              </View>
              <TextInput
                ref={phoneRef}
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 0244123456"
                placeholderTextColor="#e2e8f0"
                keyboardType="phone-pad"
                returnKeyType="next"
                onSubmitEditing={() => addressRef.current?.focus()}
                blurOnSubmit={false}
              />
              {/* WhatsApp toggle */}
              <TouchableOpacity
                style={styles.whatsappRow}
                onPress={() => setIsWhatsapp(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isWhatsapp && styles.checkboxActive]}>
                  {isWhatsapp && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.whatsappLabel}>This number is on WhatsApp</Text>
                <Text style={styles.whatsappIcon}>  </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldIcon}>📍</Text>
                <Text style={styles.label}>Address / Location</Text>
              </View>
              <TextInput
                ref={addressRef}
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. Madina Estates, House H-2"
                placeholderTextColor="#e2e8f0"
                returnKeyType="next"
                onSubmitEditing={() => amountRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Information</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldIcon}>📈</Text>
                <Text style={styles.label}>Amount Owed To You (GH₵)</Text>
              </View>
              <TextInput
                ref={amountRef}
                style={[styles.input, { fontSize: 20, fontWeight: '800', color: '#0277bd' }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#0277bd1a"
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => noteRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldIcon}>🕒</Text>
                <Text style={styles.label}>Expected Payment Date</Text>
              </View>
              <TouchableOpacity style={styles.dateSelector} onPress={openCalendar}>
                <View style={styles.dateInfo}>
                  <Text style={styles.dateText}>{formatDateFriendly(duedate)}</Text>
                  <Text style={styles.dateDay}>
                    {duedate ? new Date(duedate).toLocaleDateString('en-GB', { weekday: 'long' }) : ''}
                  </Text>
                </View>
                <View style={styles.calendarIconBg}>
                  <Text style={styles.calendarIcon}>📅</Text>
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
                <Text style={styles.fieldIcon}>📝</Text>
                <Text style={styles.label}>Note / Details</Text>
              </View>
              <TextInput
                ref={noteRef}
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={note}
                onChangeText={setNote}
                placeholder="What items were taken on credit?"
                placeholderTextColor="#e2e8f0"
                multiline
                returnKeyType="done"
                onSubmitEditing={handleSave}
                blurOnSubmit={true}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveBtn, saving && { opacity: 0.5 }]} 
          onPress={handleSave} 
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Confirm & Save Debtor'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {showIOSPicker && (
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
              onChange={(event, selected) => {
                if (selected) {
                  setPickerDate(selected);
                  setDuedate(selected.toISOString().split('T')[0]);
                }
              }}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16, paddingTop: 10, paddingBottom: 60 },
  
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  field: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldIcon: { fontSize: 13, marginRight: 8, color: '#94a3b8' },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  input: { fontSize: 16, color: '#1e293b', fontWeight: '600', padding: 0 },

  whatsappRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#25D366', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  checkboxActive: { backgroundColor: '#25D366', borderColor: '#25D366' },
  checkmark: { color: '#fff', fontWeight: '900', fontSize: 13 },
  whatsappLabel: { fontSize: 13, color: '#25D366', fontWeight: '700' },
  whatsappIcon: { fontSize: 16 },
  
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateInfo: { flex: 1 },
  dateText: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  dateDay: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  calendarIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#e1f5fe', justifyContent: 'center', alignItems: 'center' },
  calendarIcon: { fontSize: 18 },
  
  saveBtn: { backgroundColor: '#0277bd', borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 10, elevation: 4, shadowColor: '#0277bd', shadowOpacity: 0.3, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  iosPickerWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  iosPickerCard: { width: '90%', backgroundColor: '#fff', borderRadius: 24, paddingBottom: 20, overflow: 'hidden' },
  iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iosPickerDone: { color: '#0277bd', fontWeight: '800', fontSize: 16 },
});
