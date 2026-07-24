import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius, space, difficultyColor, withAlpha } from '../theme';

export default function RecipeCard({ recipe, onPress }) {
  const diff = difficultyColor(recipe.difficulty);
  const meta = [`${recipe.timeMinutes} min`, `Serves ${recipe.servings}`, recipe.cuisine]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: withAlpha(diff, 0.16) }]}>
            <Text style={[styles.chipText, { color: diff }]}>{recipe.difficulty}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.metaText}>{meta}</Text>

      <Text style={styles.title} numberOfLines={2}>
        {recipe.title}
      </Text>
      <Text style={styles.desc} numberOfLines={2}>
        {recipe.description}
      </Text>

      {recipe.usesFromPhoto?.length > 0 && (
        <Text style={styles.uses} numberOfLines={1}>
          {recipe.usesFromPhoto.join('  ·  ')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space(5),
    marginBottom: space(3.5),
  },
  pressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.99 }] },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space(2.5),
  },
  chipRow: { flexDirection: 'row', gap: space(2) },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  metaText: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginBottom: space(2.5) },

  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  desc: {
    color: colors.textMuted,
    fontSize: 14.5,
    marginTop: space(1.5),
    lineHeight: 20,
  },
  uses: {
    color: colors.textFaint,
    fontSize: 12.5,
    marginTop: space(3.5),
  },
});
