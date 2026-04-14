import 'react-native-get-random-values';
import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';

import { initDB, getSetting } from './src/storage/database';
import { PeriodProvider } from './src/context/PeriodContext';
import DashboardScreen from './src/screens/DashboardScreen';
import SalesScreen   from './src/screens/SalesScreen';
import AddSaleScreen from './src/screens/AddSaleScreen';
import SavingsScreen from './src/screens/SavingsScreen';
import AddSavingScreen from './src/screens/AddSavingScreen';
import CreditorsScreen from './src/screens/CreditorsScreen';
import AddCreditorScreen from './src/screens/AddCreditorScreen';
import CreditorDetailScreen from './src/screens/CreditorDetailScreen';
import AddCreditorPaymentScreen from './src/screens/AddCreditorPaymentScreen';
import DebtorsScreen from './src/screens/DebtorsScreen';
import AddDebtorScreen from './src/screens/AddDebtorScreen';
import DebtorDetailScreen from './src/screens/DebtorDetailScreen';
import AddDebtorPaymentScreen from './src/screens/AddDebtorPaymentScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ icon, color, focused }) {
  return (
    <View style={{ 
      width: 44, 
      height: 32, 
      borderRadius: 16, 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: focused ? color + '15' : 'transparent',
    }}>
      <Text style={{ color, fontSize: 18 }}>{icon}</Text>
    </View>
  );
}

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const layoutMap = useRef({});
  const [scrollInfo, setScrollInfo] = useState({ x: 0, width: 0, contentWidth: 0 });

  useEffect(() => {
    const activeRoute = state.routes[state.index];
    const layout = layoutMap.current[activeRoute.key];
    if (layout && scrollRef.current) {
      scrollRef.current.scrollTo({
        x: layout.x - 100,
        animated: true,
      });
    }
  }, [state.index]);

  const canScrollLeft = scrollInfo.x > 10;
  const canScrollRight = scrollInfo.x + scrollInfo.width < scrollInfo.contentWidth - 10;

  return (
    <View style={{ 
      backgroundColor: '#fff', 
      borderTopWidth: 1, 
      borderTopColor: '#f1f5f9',
      elevation: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
    }}>
      <ScrollView 
        ref={scrollRef}
        horizontal 
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={true}
        alwaysBounceHorizontal={true}
        overScrollMode="always"
        onScroll={(e) => {
          setScrollInfo({
            x: e.nativeEvent.contentOffset.x,
            width: e.nativeEvent.layoutMeasurement.width,
            contentWidth: e.nativeEvent.contentSize.width,
          });
        }}
        onLayout={(e) => {
          setScrollInfo(prev => ({ ...prev, width: e.nativeEvent.layout.width }));
        }}
        onContentSizeChange={(w) => {
          setScrollInfo(prev => ({ ...prev, contentWidth: w }));
        }}
        contentContainerStyle={{ 
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8, 
          paddingTop: 4,
          paddingHorizontal: 16,
          flexGrow: 1,
          justifyContent: 'center',
          gap: 8
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          const activeColor = options.tabBarActiveTintColor || '#00695c';
          const color = isFocused ? activeColor : '#94a3b8';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLayout={(e) => {
                layoutMap.current[route.key] = e.nativeEvent.layout;
              }}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                minWidth: 56,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: isFocused ? activeColor + '12' : 'transparent',
              }}
            >
              {options.tabBarIcon ? options.tabBarIcon({ color, focused: isFocused, size: 18 }) : null}
              <Text style={{ 
                color, 
                fontSize: 9, 
                fontWeight: isFocused ? '900' : '700', 
                textTransform: 'uppercase', 
                marginTop: 2,
                letterSpacing: 0.2
              }}>
                {label}
              </Text>
              {isFocused && (
                <View style={{
                  position: 'absolute',
                  bottom: -4,
                  width: 3,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: color
                }} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Left indicator hint */}
      {canScrollLeft && (
        <View style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 24,
          backgroundColor: 'rgba(255,255,255,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          pointerEvents: 'none',
        }}>
          <Text style={{ fontSize: 10, color: '#cbd5e1', fontWeight: '900' }}>←</Text>
        </View>
      )}

      {/* Right indicator hint */}
      {canScrollRight && (
        <View style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 24,
          backgroundColor: 'rgba(255,255,255,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          pointerEvents: 'none',
        }}>
          <Text style={{ fontSize: 10, color: '#cbd5e1', fontWeight: '900' }}>→</Text>
        </View>
      )}
    </View>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen 
        name="Home" 
        component={DashboardScreen} 
        options={{ 
          tabBarLabel: 'Home', 
          tabBarIcon: ({ color, focused }) => <TabIcon icon="🏠" color={color} focused={focused} /> 
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ 
          tabBarLabel: 'Settings', 
          tabBarActiveTintColor: '#1a1a2e',
          tabBarIcon: ({ color, focused }) => <TabIcon icon="⚙️" color={color} focused={focused} /> 
        }} 
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [storedPin, setStoredPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');

  const handlePinPress = (num) => {
    if (enteredPin.length < 4) {
      const next = enteredPin + num;
      setEnteredPin(next);
      if (next.length === 4) {
        if (next === storedPin) {
          setIsLocked(false);
          setReady(true);
        } else {
          Alert.alert('Incorrect PIN', 'Please check and try again.');
          setEnteredPin('');
        }
      }
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) return;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SaleApp',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        setIsLocked(false);
        setReady(true);
      }
    } catch (e) {
      console.error('Biometric auth error:', e);
    }
  };

  const handleBackspace = () => {
    setEnteredPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    const start = async () => {
      try {
        await initDB();
        const lockEnabled = await getSetting('app_lock_enabled', 'false');
        const bioEnabled  = await getSetting('biometric_enabled', 'false');
        const pin = await getSetting('app_pin', '0000');
        
        setStoredPin(pin);
        setIsBiometricEnabled(bioEnabled === 'true');

        if (lockEnabled === 'true') {
          setIsLocked(true);
          // Automatic trigger removed as requested
        } else {
          setReady(true);
        }
      } catch (e) {
        Alert.alert('Error', 'Startup failed.');
        setReady(true);
      }
    };
    start();
  }, []);

  if (!ready && isLocked) {
    return (
      <View style={styles.lockedRoot}>
        <StatusBar style="dark" />
        <View style={styles.lockContent}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>Enter PIN</Text>
          <Text style={styles.lockSub}>Type your 4-digit security code</Text>
          
          <View style={styles.pinDots}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.dot, enteredPin.length >= i && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, isBiometricEnabled ? '👆' : '⌫'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={[styles.key, k === '👆' && { backgroundColor: '#e0f2f1', borderWidth: 1, borderColor: '#00695c' }]} 
                onPress={() => {
                  if (k === 'C') setEnteredPin('');
                  else if (k === '⌫') handleBackspace();
                  else if (k === '👆') handleBiometricAuth();
                  else handlePinPress(k);
                }}
              >
                <Text style={[styles.keyText, k === '👆' && { color: '#00695c' }]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isBiometricEnabled && (
            <TouchableOpacity style={styles.backspaceLink} onPress={handleBackspace}>
               <Text style={styles.backspaceText}>⌫ Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00695c" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PeriodProvider>
          <NavigationContainer>
            <Stack.Navigator
              screenOptions={{
                headerStyle:      { backgroundColor: '#00695c' },
                headerTintColor:  '#fff',
                headerTitleStyle: { fontWeight: '800', fontSize: 17 },
                detachPreviousScreen: false,
                animation: 'none',
              }}
            >
              <Stack.Screen
                name="Main"
                component={TabNavigator}
                options={{ headerShown: false }}
              />
              {/* Main List Screens (Moved from Tabs) */}
              <Stack.Screen
                name="Sales"
                component={SalesScreen}
                options={{ title: 'Sales Ledger', headerStyle: { backgroundColor: '#1a237e' } }}
              />
              <Stack.Screen
                name="Savings"
                component={SavingsScreen}
                options={{ title: 'Savings Tracker', headerStyle: { backgroundColor: '#00695c' } }}
              />
              <Stack.Screen
                name="Creditors"
                component={CreditorsScreen}
                options={{ title: 'Creditor List', headerStyle: { backgroundColor: '#b71c1c' } }}
              />
              <Stack.Screen
                name="Debtors"
                component={DebtorsScreen}
                options={{ title: 'Debtor List', headerStyle: { backgroundColor: '#0277bd' } }}
              />
              <Stack.Screen
                name="AddSale"
                component={AddSaleScreen}
                options={({ route }) => ({
                  title: route?.params?.record ? 'Edit Record' : 'Sales Transaction',
                  headerStyle: { backgroundColor: '#1a237e' },
                })}
              />
              <Stack.Screen
                name="AddSaving"
                component={AddSavingScreen}
                options={({ route }) => ({
                  title: route?.params?.record ? 'Edit Saving' : 'Savings Transaction',
                })}
              />
              <Stack.Screen
                name="AddCreditor"
                component={AddCreditorScreen}
                options={({ route }) => ({
                  title: route?.params?.record ? 'Edit Creditor' : 'Add Creditor',
                  headerStyle: { backgroundColor: '#b71c1c' },
                })}
              />
              <Stack.Screen
                name="CreditorDetail"
                component={CreditorDetailScreen}
                options={{ 
                  title: 'Creditor Details',
                  headerStyle: { backgroundColor: '#b71c1c' },
                }}
              />
              <Stack.Screen
                name="AddCreditorPayment"
                component={AddCreditorPaymentScreen}
                options={{ 
                  title: 'Record Payment',
                  headerStyle: { backgroundColor: '#b71c1c' },
                }}
              />
              <Stack.Screen
                name="AddDebtor"
                component={AddDebtorScreen}
                options={({ route }) => ({
                  title: route?.params?.record ? 'Edit Debtor' : 'Add Debtor',
                  headerStyle: { backgroundColor: '#0277bd' },
                })}
              />
              <Stack.Screen
                name="DebtorDetail"
                component={DebtorDetailScreen}
                options={{ 
                  title: 'Debtor Details',
                  headerStyle: { backgroundColor: '#0277bd' },
                }}
              />
              <Stack.Screen
                name="AddDebtorPayment"
                component={AddDebtorPaymentScreen}
                options={{ 
                  title: 'Record Collection',
                  headerStyle: { backgroundColor: '#0277bd' },
                }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </PeriodProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  lockedRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  lockContent: { alignItems: 'center', width: '100%', maxWidth: 400, paddingHorizontal: 40 },
  lockIcon: { fontSize: 60, marginBottom: 16 },
  lockTitle: { fontSize: 26, fontWeight: '900', color: '#1a1a2e', textAlign: 'center' },
  lockSub: { fontSize: 15, color: '#64748b', textAlign: 'center', marginTop: 8, fontWeight: '600' },
  
  pinDots: { flexDirection: 'row', marginTop: 30, gap: 16, marginBottom: 40 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#e2e8f0' },
  dotActive: { backgroundColor: '#1a1a2e' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'center' },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', margin: 6 },
  keyText: { fontSize: 24, fontWeight: '700', color: '#1a1a2e' },
  backspaceLink: { marginTop: 24, padding: 12 },
  backspaceText: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
});
