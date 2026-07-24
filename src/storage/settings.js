import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'srp.anthropicApiKey';

export async function getApiKey() {
  try {
    return (await AsyncStorage.getItem(KEY)) || '';
  } catch {
    return '';
  }
}

export async function setApiKey(value) {
  await AsyncStorage.setItem(KEY, (value || '').trim());
}

export async function clearApiKey() {
  await AsyncStorage.removeItem(KEY);
}
