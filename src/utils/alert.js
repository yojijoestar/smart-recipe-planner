import { Alert, Platform } from 'react-native';

// react-native-web ships Alert.alert as a total no-op (`static alert() {}`),
// so on web every Alert.alert call silently does nothing — no dialog, no
// console output. That's what made the photo/camera buttons look "dead" on
// web: they're gated behind an Alert.alert() that never actually fires.
// This wraps Alert.alert so web falls back to browser-native dialogs instead.
export function showAlert(title, message, buttons = [{ text: 'OK' }]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (buttons.length <= 1) {
    window.alert(text);
    buttons[0]?.onPress?.();
    return;
  }

  // window.confirm only has two outcomes, so map the cancel-style button to
  // "Cancel" and everything else to "OK".
  const cancelBtn = buttons.find((b) => b.style === 'cancel') || buttons[0];
  const confirmBtn = buttons.find((b) => b !== cancelBtn) || buttons[buttons.length - 1];
  if (window.confirm(text)) {
    confirmBtn.onPress?.();
  } else {
    cancelBtn.onPress?.();
  }
}
