import React from 'react';
import { Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableFreeze } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import RecipeDetailScreen from './src/screens/RecipeDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

// This app is light-only. Force it regardless of the system/device appearance so
// native chrome (header, back button) never briefly renders in the system's dark
// styling before our own colors paint — that's what caused the "flash dark" bug.
Appearance.setColorScheme?.('light');
enableFreeze(true);

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.hairline,
    primary: colors.accent,
  },
};

// iOS 26's native header buttons are force-wrapped by the OS in the new "Liquid
// Glass" material and flash dark mid-transition — a react-native-screens/iOS 26
// bug with no JS-level opt-out (github.com/software-mansion/react-native-screens
// issues #3226 / #3782). We avoid it entirely by hiding the native header and
// rendering our own in-content header (see src/components/ScreenHeader.js) —
// plain React Native views, never touched by the OS chrome.
const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.bg },
  freezeOnBlur: true, // stops the outgoing screen re-rendering mid-transition
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
