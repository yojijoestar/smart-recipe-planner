import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';

// Plain-view header rendered as normal content, not a native UINavigationBar.
// iOS 26 force-wraps native header buttons in "Liquid Glass" and flashes dark
// during transitions (react-native-screens issue #3226) — this sidesteps it
// entirely since none of this is native chrome.
export default function ScreenHeader({ title, onBack, rightLabel, onRightPress }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space(2) }]}>
      <View style={styles.side}>
        {onBack && (
          <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>
        {rightLabel && (
          <Pressable hitSlop={12} onPress={onRightPress}>
            <Text style={styles.rightLabel}>{rightLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: space(4),
    paddingBottom: space(3),
  },
  side: { minWidth: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backChevron: { color: colors.accent, fontSize: 30, fontWeight: '400', marginTop: -2 },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  rightLabel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
