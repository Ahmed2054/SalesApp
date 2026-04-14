import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ScrollView, Switch, Platform, Linking, DeviceEventEmitter
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  updateSetting, 
  getSetting, 
  backupDatabaseFile, 
  getInternalBackups,
  restoreDatabaseFromUri, 
  resetData 
} from '../storage/database';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as DocumentPicker from 'expo-document-picker';
import { Modal, FlatList } from 'react-native';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  
  const [businessName, setBusinessName] = useState('');
  const [lastBackup, setLastBackup] = useState('Never');
  const [backupCount, setBackupCount] = useState(0);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [appPin, setAppPin] = useState('0000');
  const [dashboardStyle, setDashboardStyle] = useState('flipping'); // 'flipping', 'scrolling', or 'static'
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupsList, setBackupsList] = useState([]);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [wipeBackupsOnReset, setWipeBackupsOnReset] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);

  // States for cross-platform PIN change modal
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinPhase, setPinPhase] = useState('verify'); // 'verify' or 'new'
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const sortBackupsNewestFirst = (backups = []) => {
    return [...backups].sort((a, b) => b.localeCompare(a));
  };

  const refreshBackups = async () => {
    const backups = await getInternalBackups();
    const sortedBackups = sortBackupsNewestFirst(backups);
    setBackupsList(sortedBackups);
    setBackupCount(sortedBackups.length);
    return sortedBackups;
  };

  const getBackupUri = (fileName) => `${FileSystem.documentDirectory}Backups/${fileName}`;

  const loadSettings = async () => {
    try {
      const [name, theme, dStyle, backup, lock, bio, pin, backups] = await Promise.all([
        getSetting('business_name', 'User'),
        getSetting('theme', 'light'),
        getSetting('dashboard_ticker_style', 'flipping'),
        getSetting('last_backup', 'Never'),
        getSetting('app_lock_enabled', 'false'),
        getSetting('biometric_enabled', 'false'),
        getSetting('app_pin', '0000'),
        getInternalBackups()
      ]);

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometricHardware(hasHardware && isEnrolled);

      setBusinessName(name);
      setDashboardStyle(dStyle);
      setIsDarkMode(theme === 'dark');
      setLastBackup(backup);
      setIsLockEnabled(lock === 'true');
      setIsBiometricEnabled(bio === 'true');
      setAppPin(pin);
      const sortedBackups = sortBackupsNewestFirst(backups);
      setBackupsList(sortedBackups);
      setBackupCount(sortedBackups.length);
    } catch (e) {
      console.error('[Sales App] Settings load error:', e);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);


  const handleToggleLock = async (val) => {
    setIsLockEnabled(val);
    await updateSetting('app_lock_enabled', val ? 'true' : 'false');
  };

  const handleToggleBiometrics = async (val) => {
    setIsBiometricEnabled(val);
    await updateSetting('biometric_enabled', val ? 'true' : 'false');
  };

  const handleChangePin = () => {
    setPinPhase('verify');
    setPinInput('');
    setPinError('');
    setPinModalVisible(true);
  };

  const handlePinSubmit = async () => {
    if (pinPhase === 'verify') {
      if (pinInput === appPin) {
        setPinPhase('new');
        setPinInput('');
        setPinError('');
      } else {
        setPinError('Incorrect current PIN');
        setPinInput('');
      }
    } else {
      // New PIN logic
      if (/^\d{4}$/.test(pinInput)) {
        try {
          setAppPin(pinInput);
          await updateSetting('app_pin', pinInput);
          setPinModalVisible(false);
          Alert.alert('Success', 'Your security PIN has been updated successfully.');
        } catch (e) {
          setPinError('Failed to save the new PIN');
        }
      } else {
        setPinError('New PIN must be exactly 4 digits');
      }
    }
  };


  const handleCreateBackup = async () => {
    try {
      const res = await backupDatabaseFile();
      if (res.success) {
        const now = new Date().toLocaleString();
        await updateSetting('last_backup', now);
        setLastBackup(now);
        await refreshBackups();

        Alert.alert('Backup Successful', `Internal database backup created: \n${res.fileName}`);
      }
    } catch (e) {
      Alert.alert('Backup Failed', 'Could not create internal database backup.');
    }
  };

  const handleRestoreFromUri = async (uri) => {
    Alert.alert(
      'Restore Database',
      'Are you sure? This will OVERWRITE all current data. Operation cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore Now', 
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await restoreDatabaseFromUri(uri);
              DeviceEventEmitter.emit('db_restored');
              await loadSettings();
              Alert.alert('Success', 'Database has been restored successfully. All your data has been updated across the application.');
            } catch (err) {
              Alert.alert('Restore Failed', 'Could not restore the database file.');
            } finally {
              setSaving(false);
              setShowRestoreModal(false);
            }
          }
        }
      ]
    );
  };

  const handleExternalRestore = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/octet-stream',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        await handleRestoreFromUri(res.assets[0].uri, true);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick file.');
    }
  };

  const handleInternalRestorePick = (fileName) => {
    const uri = getBackupUri(fileName);
    handleRestoreFromUri(uri);
  };

  const handleShareBackupFile = async (fileName) => {
    try {
      const uri = getBackupUri(fileName);
      const info = await FileSystem.getInfoAsync(uri);

      if (!info.exists) {
        Alert.alert('File Missing', 'This backup file could not be found.');
        await refreshBackups();
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: `Share ${fileName}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
      }
    } catch (e) {
      console.error('[Sales App] Backup share error:', e);
      Alert.alert('Share Failed', 'Could not share this backup file.');
    }
  };

  const handleDeleteBackupFile = (fileName) => {
    Alert.alert(
      'Delete Backup',
      `Delete "${fileName}" from internal backups?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const uri = getBackupUri(fileName);
              const info = await FileSystem.getInfoAsync(uri);

              if (!info.exists) {
                Alert.alert('File Missing', 'This backup file could not be found.');
              } else {
                await FileSystem.deleteAsync(uri, { idempotent: true });
              }

              await refreshBackups();
            } catch (e) {
              console.error('[Sales App] Backup delete error:', e);
              Alert.alert('Delete Failed', 'Could not delete this backup file.');
            }
          }
        }
      ]
    );
  };

  const handleResetData = async () => {
    Alert.alert(
      'Permanent Data Reset',
      '⚠️ DANGER: This will PERMANENTLY DELETE all your sales records, savings, creditors, and settings. \n\nThis action cannot be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Erase Everything', 
          style: 'destructive',
          onPress: async () => {
            // Confirm twice for safety
            Alert.alert(
              'Final Confirmation',
              'Once more: Do you want to wipe ALL application data? \n\nIf you have not made a backup, YOUR DATA WILL BE LOST FOREVER.',
              [
                { text: 'Abort', style: 'cancel' },
                {
                  text: 'YES, ERASE ALL',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setSaving(true);
                      await resetData(wipeBackupsOnReset);
                      DeviceEventEmitter.emit('db_restored');
                      await loadSettings();
                      Alert.alert('System Reset', 'All application data has been wiped. The app has been returned to its factory state.');
                    } catch (e) {

                      Alert.alert('Reset Failed', 'An error occurred while trying to erase data.');
                    } finally {
                      setSaving(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };



  const handleCheckForUpdate = async () => {
    setUpdateChecking(true);
    try {
      const res = await fetch(
        'https://api.github.com/repos/TM1-Ahmed/SalesApp/releases/latest',
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      const latest = (data.tag_name || '').replace(/^v/, '');
      const current = '1.0.0';
      if (latest && latest !== current) {
        Alert.alert(
          '🎉 Update Available!',
          `A new version (v${latest}) is available.\nYou are on v${current}.`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Download Now', onPress: () => Linking.openURL(data.html_url) }
          ]
        );
      } else {
        Alert.alert('✅ You\'re Up to Date', `Running the latest version (v${current}).`);
      }
    } catch (e) {
      Alert.alert(
        '🟡 Check Failed',
        'Could not reach the update server. Please check your internet connection.',
      );
    } finally {
      setUpdateChecking(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateSetting('business_name', businessName.trim() || 'User');
      Alert.alert('Settings Saved', 'Business profile updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Could not save profile settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTheme = async (val) => {
    setIsDarkMode(val);
    try {
      await updateSetting('theme', val ? 'dark' : 'light');
    } catch (e) { }
  };



  return (
    <View style={styles.root}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Profile</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Display Name / Business Name</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. My Awesome Shop"
            />
            <TouchableOpacity 
              style={[styles.saveBtn, saving && { opacity: 0.5 }]} 
              onPress={handleSaveProfile}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Update Name'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isLockEnabled && hasBiometricHardware ? 12 : 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>PIN App Lock</Text>
                <Text style={styles.cardSub}>Require 4-digit code to open app</Text>
              </View>
              <Switch
                value={isLockEnabled}
                onValueChange={handleToggleLock}
                trackColor={{ false: '#eee', true: '#1a1a2e' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>

            {hasBiometricHardware && isLockEnabled && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f8fafc', marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>Biometric Unlock</Text>
                  <Text style={styles.cardSub}>Use Fingerprint / Face ID</Text>
                </View>
                <Switch
                  value={isBiometricEnabled}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: '#eee', true: '#1a1a2e' }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                />
              </View>
            )}

            <TouchableOpacity style={styles.pinBtn} onPress={handleChangePin}>
              <View>
                <Text style={styles.pinBtnTitle}>Change App PIN</Text>
                <Text style={styles.pinBtnSub}>Current PIN: ****</Text>
              </View>
              <Text style={styles.pinBtnArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard Style</Text>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <TouchableOpacity 
                style={[styles.styleBtn, dashboardStyle === 'scrolling' && styles.styleBtnActive]} 
                onPress={async () => { setDashboardStyle('scrolling'); await updateSetting('dashboard_ticker_style', 'scrolling'); }}
              >
                <Text style={styles.styleBtnEmoji}>Auto</Text>
                <Text style={[styles.styleBtnText, dashboardStyle === 'scrolling' && { color: '#fff' }]}>Scroll</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.styleBtn, dashboardStyle === 'flipping' && styles.styleBtnActive]} 
                onPress={async () => { setDashboardStyle('flipping'); await updateSetting('dashboard_ticker_style', 'flipping'); }}
              >
                <Text style={styles.styleBtnEmoji}>Auto</Text>
                <Text style={[styles.styleBtnText, dashboardStyle === 'flipping' && { color: '#fff' }]}>Flip</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.styleBtn, dashboardStyle === 'static' && styles.styleBtnActive]} 
                onPress={async () => { setDashboardStyle('static'); await updateSetting('dashboard_ticker_style', 'static'); }}
              >
                <Text style={styles.styleBtnEmoji}>None</Text>
                <Text style={[styles.styleBtnText, dashboardStyle === 'static' && { color: '#fff' }]}>Static</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardSub}>"Scroll/Flip" auto-rotate; "Static" stays on one card until you change it.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.subTitle}>Backup & Restore</Text>
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={() => setShowRestoreModal(true)}>
            <View style={[styles.exportIcon, { backgroundColor: '#e1f5fe' }]}>
              <Text style={{ fontSize: 20 }}>🗂️</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.exportTitle}>Backup & Restore Files</Text>
              <Text style={styles.exportSub}>{backupCount} internal backups available</Text>
            </View>
          </TouchableOpacity>

          <View style={{ marginTop: 24, marginBottom: 12 }}>
            <Text style={[styles.subTitle, { color: '#c62828' }]}>Maintenance & Danger Zone</Text>
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={handleResetData}>
            <View style={[styles.exportIcon, { backgroundColor: '#ffebee' }]}>
              <Text style={{ fontSize: 20 }}>⚠️</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={[styles.exportTitle, { color: '#c62828' }]}>Factory Data Reset</Text>
              <Text style={styles.exportSub}>Permanently wipe all records</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.cardRow, { marginTop: 12, backgroundColor: '#fff5f5' }]}>
            <View flex={1}>
              <Text style={[styles.cardLabel, { color: '#c62828' }]}>Include Backup Files</Text>
              <Text style={styles.cardSub}>Delete internal .db snapshots too</Text>
            </View>
            <Switch
              value={wipeBackupsOnReset}
              onValueChange={setWipeBackupsOnReset}
              trackColor={{ false: '#eee', true: '#c62828' }}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>
        </View>

        {/* ── Help & Support Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help & Support</Text>
          <View style={styles.card}>
            <View style={styles.contactRow}>
              <View style={styles.contactIcon}><Text>✉️</Text></View>
              <View flex={1}>
                <Text style={styles.contactLabel}>Email Support</Text>
                <Text style={styles.contactValue}>ofosuahmed@gmail.com</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.contactRow, { marginTop: 16 }]} 
              onPress={() => Linking.openURL('tel:+233553484762')}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#e8f5e9' }]}><Text>📞</Text></View>
              <View flex={1}>
                <Text style={styles.contactLabel}>Call / WhatsApp</Text>
                <Text style={[styles.contactValue, { color: '#00695c' }]}>+233 55 348 4762</Text>
              </View>
              <Text style={styles.contactArrow}>→</Text>
            </TouchableOpacity>
 
            <TouchableOpacity 
              style={[styles.contactRow, { marginTop: 16 }]} 
              onPress={() => setShowAboutModal(true)}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#fcf8ff' }]}><Text>ℹ️</Text></View>
              <View flex={1}>
                <Text style={styles.contactLabel}>Information</Text>
                <Text style={[styles.contactValue, { color: '#6a1b9a' }]}>About the App</Text>
              </View>
              <Text style={styles.contactArrow}>→</Text>
            </TouchableOpacity>

            {/* How to Use */}
            <TouchableOpacity 
              style={[styles.contactRow, { marginTop: 16 }]} 
              onPress={() => setShowHowToModal(true)}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#e8f5e9' }]}><Text>📖</Text></View>
              <View flex={1}>
                <Text style={styles.contactLabel}>Getting Started</Text>
                <Text style={[styles.contactValue, { color: '#2e7d32' }]}>How to Use This App</Text>
              </View>
              <Text style={styles.contactArrow}>→</Text>
            </TouchableOpacity>

            {/* Check for Update */}
            <TouchableOpacity 
              style={[styles.contactRow, { marginTop: 16 }]}
              onPress={handleCheckForUpdate}
              disabled={updateChecking}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#e3f2fd' }]}><Text>{updateChecking ? '⏳' : '🔄'}</Text></View>
              <View flex={1}>
                <Text style={styles.contactLabel}>App Updates</Text>
                <Text style={[styles.contactValue, { color: '#0277bd' }]}>
                  {updateChecking ? 'Checking...' : 'Check for Update'}
                </Text>
              </View>
              <Text style={styles.contactArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </View>




        <Modal visible={pinModalVisible} animationType="fade" transparent>
          <View style={styles.modalBg}>
            <View style={[styles.modalSheet, styles.backupModalSheet]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {pinPhase === 'verify' ? 'Current Security PIN' : 'Set New Security PIN'}
                </Text>
                <TouchableOpacity onPress={() => setPinModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={styles.cardSub}>
                  {pinPhase === 'verify' 
                    ? 'Enter current 4-digit security code' 
                    : 'Choose a new 4-digit security code'}
                </Text>

                <View style={[styles.pinDots, { marginBottom: 30 }]}>
                  {[1, 2, 3, 4].map(i => (
                    <View key={i} style={[styles.dot, pinInput.length >= i && styles.dotActive]} />
                  ))}
                </View>

                {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

                <View style={[styles.keypad, { width: 260 }]}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => (
                    <TouchableOpacity 
                      key={k} 
                      style={[styles.key, { width: 70, height: 70 }]} 
                      onPress={() => {
                        if (k === 'C') setPinInput('');
                        else if (k === '✓') handlePinSubmit();
                        else if (pinInput.length < 4) setPinInput(p => p + k);
                      }}
                    >
                      <Text style={[styles.keyText, k === '✓' && { color: '#00695c' }]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showRestoreModal} animationType="fade" transparent>
          <View style={styles.modalBg}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Backup Manager</Text>
                <TouchableOpacity onPress={() => setShowRestoreModal(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.backupToolbar}>
                <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionPrimary]} onPress={handleCreateBackup}>
                  <Text style={styles.modalActionPrimaryText}>Back Up Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalActionBtn} onPress={handleExternalRestore}>
                  <Text style={styles.modalActionText}>Restore External</Text>
                </TouchableOpacity>
              </View>

              {backupsList.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No internal backups found yet.</Text>
                </View>
              ) : (
                <FlatList
                  data={backupsList}
                  keyExtractor={item => item}
                  renderItem={({ item }) => (
                    <View style={styles.backupItem}>
                      <View style={styles.backupMeta}>
                        <Text style={styles.backupName}>{item}</Text>
                        <Text style={styles.backupDate}>Internal backup file</Text>
                      </View>
                      <View style={styles.backupActions}>
                        <TouchableOpacity
                          style={[styles.backupActionBtn, styles.backupRestoreBtn]}
                          onPress={() => handleInternalRestorePick(item)}
                        >
                          <Text style={[styles.backupActionText, styles.backupRestoreText]}>Restore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.backupActionBtn}
                          onPress={() => handleShareBackupFile(item)}
                        >
                          <Text style={styles.backupActionText}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.backupActionBtn, styles.backupDeleteBtn]}
                          onPress={() => handleDeleteBackupFile(item)}
                        >
                          <Text style={[styles.backupActionText, styles.backupDeleteText]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                  contentContainerStyle={{ padding: 20 }}
                />
              )}
            </View>
          </View>
        </Modal>

        <Modal visible={showAboutModal} animationType="fade" transparent>
          <View style={styles.modalBg}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>About Sales App</Text>
                <TouchableOpacity onPress={() => setShowAboutModal(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView contentContainerStyle={{ padding: 24 }}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                   <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: '#1a237e', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 40 }}>⚙️</Text>
                   </View>
                   <Text style={{ fontSize: 22, fontWeight: '900', color: '#1a1a2e' }}>Sales App</Text>
                   <Text style={{ fontSize: 13, color: '#94a3b8', fontWeight: '700' }}>Version 1.0.0 (Stable)</Text>
                </View>

                <Text style={styles.aboutTag}>PURPOSE</Text>
                <Text style={styles.aboutText}>
                  A professional, secure tool for tracking sales, personal savings, and managing debt (creditors and debtors) completely offline.
                </Text>

                <Text style={styles.aboutTag}>SECURITY</Text>
                <Text style={styles.aboutText}>
                  Your data stays on your phone. Optional PIN and Biometric security keep your records private and protected from unauthorized access.
                </Text>

                <Text style={styles.aboutTag}>DATA CONTROL</Text>
                <Text style={styles.aboutText}>
                  Take full control of your records with internal/external backups and restoration capabilities.
                </Text>

                <View style={{ marginTop: 24, padding: 16, backgroundColor: '#f8fafc', borderRadius: 16 }}>
                   <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: '800' }}>DESIGNED FOR OFFLINE SUCCESS</Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── How to Use Modal ── */}
        <Modal visible={showHowToModal} animationType="slide" transparent>
          <View style={styles.modalBg}>
            <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📖 How to Use SalesApp</Text>
                <TouchableOpacity onPress={() => setShowHowToModal(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>

                {[
                  { icon: '💰', title: 'Recording Sales', color: '#1a237e',
                    steps: [
                      'Tap the Sales tab at the bottom.',
                      'Press the ＋ button to add a new sale.',
                      'Enter the amount, date, and an optional note.',
                      'Tap "Confirm & Save" — done!',
                      'Swipe left on any record to Edit or Delete it.',
                    ]
                  },
                  { icon: '🏦', title: 'Tracking Savings', color: '#00695c',
                    steps: [
                      'Tap the Savings tab.',
                      'Press ＋ to record a Deposit or Withdrawal.',
                      'Your running balance is shown at the top.',
                      'Swipe left on a record to edit or delete it.',
                    ]
                  },
                  { icon: '🤝', title: 'Managing Debtors', color: '#0277bd',
                    steps: [
                      'Tap the Debtors tab — these are people who OWE YOU money.',
                      'Press ＋ to add a new debtor.',
                      'Enter their name, phone, address, and amount owed.',
                      'Tick "This number is on WhatsApp" if they use WhatsApp.',
                      'Tap a debtor card to open their detail page.',
                      'On the detail page, press "Record Payment Collection" when they pay.',
                      'Use Call / WA / SMS / Share pills on each card to contact or share their record.',
                      'The Share button will send their debt summary directly via WhatsApp if ticked.',
                    ]
                  },
                  { icon: '📋', title: 'Managing Creditors', color: '#b71c1c',
                    steps: [
                      'Tap the Creditors tab — these are people YOU OWE money.',
                      'Press ＋ to add a creditor.',
                      'Record payments you make to them by tapping "Record New Payment".',
                      'Share their record or payment details anytime using the Share pill.',
                    ]
                  },
                  { icon: '🔒', title: 'Security & Lock', color: '#4a148c',
                    steps: [
                      'Go to Settings → Security.',
                      'Enable PIN App Lock and set a 4-digit code.',
                      'Enable Biometric Unlock for fingerprint access.',
                      'Tap "Change App PIN" to update your code anytime.',
                    ]
                  },
                  { icon: '🗂️', title: 'Backup & Restore', color: '#e65100',
                    steps: [
                      'Go to Settings → Data Management.',
                      'Tap "Backup & Restore Files" to create an internal snapshot.',
                      'Share a backup file to Google Drive, email, or another device.',
                      'Restore using an internal backup or an external .db file.',
                    ]
                  },
                ].map((section, i) => (
                  <View key={i} style={styles.howToSection}>
                    <View style={[styles.howToHeader, { backgroundColor: section.color + '15' }]}>
                      <Text style={styles.howToIcon}>{section.icon}</Text>
                      <Text style={[styles.howToTitle, { color: section.color }]}>{section.title}</Text>
                    </View>
                    {section.steps.map((step, j) => (
                      <View key={j} style={styles.howToStep}>
                        <View style={[styles.howToNum, { backgroundColor: section.color }]}>
                          <Text style={styles.howToNumText}>{j + 1}</Text>
                        </View>
                        <Text style={styles.howToStepText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                ))}

                <View style={styles.howToTip}>
                  <Text style={styles.howToTipText}>💡 Tip: Pull down on any list to refresh the data.</Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>


        {/* ── Disclaimer Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disclaimer</Text>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ fontSize: 20 }}>⚖️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.disclaimerText}>
                   All data is stored locally on this device. You are responsible for maintaining your own backups. 
                   The developer is not responsible for any data loss, financial inaccuracies, or damages resulting 
                   from the use of this application.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footerText}>Sales App v1.0.0</Text>
        <Text style={styles.footerSub}>Secure Offline Financial Management</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 32, fontWeight: '900', color: '#1a1a2e', marginBottom: 30 },
  
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 },
  subTitle: { fontSize: 11, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 4 },
  
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  cardRow: { backgroundColor: '#fff', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },

  supportLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  supportText: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  supportArrow: { fontSize: 18, color: '#94a3b8', fontWeight: '800' },
  
  cardLabel: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  cardSub: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600' },

  pinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, marginTop: 10 },
  pinBtnTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  pinBtnSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  pinBtnArrow: { fontSize: 18, color: '#94a3b8', fontWeight: '800' },

  label: { fontSize: 12, fontWeight: '800', color: '#94a3b8', marginBottom: 8 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 16, fontSize: 16, color: '#1e293b', fontWeight: '600' },
  
  saveBtn: { backgroundColor: '#1a237e', borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  exportBtn: { backgroundColor: '#fff', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  exportIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#e0f2f1', justifyContent: 'center', alignItems: 'center' },
  exportTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  exportSub: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600' },

  footerText: { textAlign: 'center', fontSize: 14, fontWeight: '800', color: '#64748b', marginTop: 20 },
  footerSub: { textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: '600' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#fff', borderRadius: 32, width: '100%', maxWidth: 360, maxHeight: '80%', overflow: 'hidden', elevation: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 },
  backupModalSheet: { maxWidth: 420, maxHeight: '82%' },
  modalHeader: { padding: 24, paddingBottom: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1a1a2e', textAlign: 'center' },
  closeBtn: { position: 'absolute', right: 20, top: 20, width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  closeBtnText: { color: '#64748b', fontWeight: '900' },

  backupToolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  modalActionBtn: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#dbe4f0', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  modalActionPrimary: { backgroundColor: '#1a237e', borderColor: '#1a237e' },
  modalActionText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  modalActionPrimaryText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  backupItem: { paddingVertical: 14 },
  backupMeta: { marginBottom: 12, paddingRight: 8 },
  backupName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  backupDate: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  backupActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  backupActionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  backupActionText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  backupRestoreBtn: { backgroundColor: '#e8f5e9', borderColor: '#c8e6c9' },
  backupRestoreText: { color: '#1b5e20' },
  backupDeleteBtn: { backgroundColor: '#ffebee', borderColor: '#ffcdd2' },
  backupDeleteText: { color: '#b71c1c' },
  separator: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 2 },

  emptyState: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontWeight: '600' },

  errorText: { color: '#c62828', fontSize: 13, fontWeight: '700', marginBottom: 20 },
  pinDots: { flexDirection: 'row', gap: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#e2e8f0' },
  dotActive: { backgroundColor: '#1a1a2e' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: { backgroundColor: '#f8fafc', borderRadius: 35, justifyContent: 'center', alignItems: 'center', margin: 6 },
  keyText: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  styleBtn: {
    flex: 1,
    height: 80,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  styleBtnActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  styleBtnText: { fontSize: 13, fontWeight: '800', color: '#64748b', marginTop: 4 },
  styleBtnEmoji: { fontSize: 20 },
  
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  contactIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  contactLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
  contactValue: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginTop: 1 },
  contactArrow: { fontSize: 18, color: '#e2e8f0', fontWeight: '800' },
  disclaimerText: { fontSize: 12, color: '#64748b', fontWeight: '500', lineHeight: 18, fontStyle: 'italic' },
  aboutTag: { fontSize: 10, fontWeight: '900', color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 16, marginBottom: 4 },
  aboutText: { fontSize: 14, color: '#64748b', lineHeight: 22, fontWeight: '500' },

  howToSection: { marginBottom: 20 },
  howToHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, gap: 10 },
  howToIcon: { fontSize: 20 },
  howToTitle: { fontSize: 15, fontWeight: '900' },
  howToStep: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  howToNum: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  howToNumText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  howToStepText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 20, fontWeight: '500' },
  howToTip: { backgroundColor: '#fffde7', borderRadius: 14, padding: 14, marginTop: 8 },
  howToTipText: { fontSize: 13, color: '#f57f17', fontWeight: '700', lineHeight: 20 },
});
