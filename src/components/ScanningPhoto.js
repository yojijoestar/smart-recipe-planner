import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import { colors, radius, withAlpha } from '../theme';

// Shows the user's just-taken photo with a scan line sweeping up and down,
// so it's obvious which photo is being analyzed and that work is happening.
export default function ScanningPhoto({ uri, height = 200 }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const lineTravel = height - 26;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 4 + lineTravel],
  });
  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.9, 0.5, 0.9],
  });

  return (
    <View style={[styles.wrap, { height }]}>
      <Image source={{ uri }} style={[styles.photo, { height }]} />
      <View style={styles.tint} />
      <Animated.View style={[styles.line, { transform: [{ translateY }], opacity: glowOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photo: { width: '100%' },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(colors.accent, 0.06),
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
