import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import { getApiKey, setApiKey, clearApiKey } from '../storage/settings';
import { showAlert } from '../utils/alert';
import { colors, radius, space } from '../theme';

export default function SettingsScreen({ navigation }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    getApiKey().then((k) => {
      setValue(k);
      setSaved(k);
    });
  }, []);

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed && !trimmed.startsWith('sk-ant-')) {
      showAlert('That doesn’t look right', 'Anthropic keys start with "sk-ant-". Save anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', onPress: () => commit(trimmed) },
      ]);
      return;
    }
    commit(trimmed);
  };

  const commit = async (trimmed) => {
    await setApiKey(trimmed);
    setSaved(trimmed);
    showAlert('Saved', 'Your API key is stored on this device.', [
      { text: 'Done', onPress: () => navigation.goBack() },
    ]);
  };

  const remove = async () => {
    await clearApiKey();
    setValue('');
    setSaved('');
  };

  const masked = saved ? `${saved.slice(0, 10)}…${saved.slice(-4)}` : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI provider</Text>
          <Text style={styles.comingSoonNote}>
            Right now we only support Anthropic API keys. Support for other AI providers
            is coming soon.
          </Text>

          <Text style={styles.label}>ANTHROPIC API KEY</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="sk-ant-…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.input}
          />
          {masked && <Text style={styles.saved}>Currently saved: {masked}</Text>}

          <Pressable
            onPress={save}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.saveText}>Save key</Text>
          </Pressable>

          {saved ? (
            <Pressable onPress={remove} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={styles.remove}>Remove key</Text>
            </Pressable>
          ) : null}

          <View style={styles.info}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoBody}>
              The app sends your ingredient photo directly to the Anthropic API using this
              key and gets back structured recipes. The key is stored only on this device
              and is never sent anywhere else.
            </Text>
            <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
              <Text style={styles.link}>Get an API key ↗</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5) },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space(5),
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: space(4),
  },
  comingSoonNote: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    marginBottom: space(5),
  },
  label: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: space(2.5),
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    padding: space(4.5),
    color: colors.text,
    fontSize: 15,
  },
  saved: { color: colors.textMuted, fontSize: 13, marginTop: space(2.5) },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space(4.5),
    alignItems: 'center',
    marginTop: space(5),
  },
  saveText: { color: colors.accentInk, fontSize: 16, fontWeight: '700' },
  remove: {
    color: colors.red,
    textAlign: 'center',
    marginTop: space(5),
    fontSize: 14,
    fontWeight: '600',
  },
  info: {
    marginTop: space(6),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: space(4.5),
  },
  infoTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700', marginBottom: space(2) },
  infoBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  link: { color: colors.accent, fontSize: 14.5, fontWeight: '600', marginTop: space(4) },
});
