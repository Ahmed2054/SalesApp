import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';

const GITHUB_API_URL = 'https://api.github.com/repos/Ahmed2054/SalesApp/releases/latest';

/**
 * Checks for updates from GitHub releases.
 * @param {boolean} silent If true, only alerts if an update is found.
 */
export const checkForUpdates = async (silent = false) => {
  const currentVersion = Constants.expoConfig?.version || '2.0.0';
  
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (response.status === 404) {
      if (!silent) Alert.alert("✅ You're Up to Date", `Running the latest version (v${currentVersion}).`);
      return;
    }

    if (!response.ok) throw new Error('Update fetch failed');

    const data = await response.json();
    const latestVersion = (data.tag_name || '').replace(/^v/, '');

    if (latestVersion && latestVersion !== currentVersion) {
      Alert.alert(
        '🎉 Update Available!',
        `A new version (v${latestVersion}) is available.\nYou are currently on v${currentVersion}.`,
        [
          { text: 'Later', style: 'cancel' },
          { 
            text: 'Download Now', 
            onPress: () => Linking.openURL(data.html_url) 
          }
        ]
      );
    } else {
      if (!silent) {
        Alert.alert("✅ You're Up to Date", `Running the latest version (v${currentVersion}).`);
      }
    }
  } catch (error) {
    if (!silent) {
      Alert.alert('Update Check Failed', 'Could not connect to the update server. Please check your internet connection.');
    }
    console.error('[SalesApp] Update check error:', error);
  }
};
