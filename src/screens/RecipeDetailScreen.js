import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import { primeDetail } from '../api/detailCache';
import { getApiKey } from '../storage/settings';
import { colors, radius, space, difficultyColor, withAlpha } from '../theme';

const Stat = ({ label, value, color, cellStyle }) => (
  <View style={[styles.stat, cellStyle]}>
    <Text
      style={[styles.statValue, color && { color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {value}
    </Text>
    <Text style={styles.statLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Legend = ({ color, label }) => (
  <View style={styles.legendItem}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

export default function RecipeDetailScreen({ route, navigation }) {
  const { recipe, ingredients, mode = 'onHand' } = route.params;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const key = await getApiKey();
      if (!key) throw new Error('No API key set. Add one in Settings.');
      // Usually already resolved from the background prefetch → instant.
      const d = await primeDetail(key, recipe, ingredients, mode);
      setDetail(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show what we already know from the list immediately; only the body waits.
  const d = detail || recipe;

  // Have + to-buy first, optional extras last so the shopping list reads clearly.
  const rank = (ing) => (ing.fromPhoto ? 0 : ing.optional ? 2 : 1);
  const orderedIngredients = detail
    ? [...detail.ingredients].sort((a, b) => rank(a) - rank(b))
    : [];

  return (
    <View style={styles.container}>
      <ScreenHeader title={d.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{d.title}</Text>
      <Text style={styles.desc}>{d.description}</Text>

      <View style={styles.statRow}>
        <Stat
          label="Time"
          value={`${d.timeMinutes}m`}
          color={colors.blue}
          cellStyle={[styles.statBorderRight, styles.statBorderBottom]}
        />
        <Stat label="Serves" value={d.servings} cellStyle={styles.statBorderBottom} />
        <Stat
          label="Difficulty"
          value={d.difficulty}
          color={difficultyColor(d.difficulty)}
          cellStyle={styles.statBorderRight}
        />
        <Stat label="Cuisine" value={d.cuisine} color={colors.accent} />
      </View>

      {loading && (
        <View style={styles.inlineLoad}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.inlineLoadText}>Getting your recipe to you right away…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {!detail ? null : (
      <>
      <Text style={styles.section}>Ingredients</Text>
      <View style={styles.card}>
        {orderedIngredients.map((ing, i) => {
          const state = ing.fromPhoto ? 'have' : ing.optional ? 'optional' : 'buy';
          const dotColor =
            state === 'have'
              ? colors.green
              : state === 'buy'
              ? colors.accent
              : colors.textFaint;
          return (
            <View
              key={i}
              style={[styles.ingRow, i === orderedIngredients.length - 1 && styles.lastRow]}
            >
              <View style={styles.ingLeft}>
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <Text
                  style={[styles.ingItem, state === 'optional' && styles.ingItemOptional]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {ing.item}
                </Text>
                {state === 'optional' && (
                  <View style={styles.optTag}>
                    <Text style={styles.optTagText}>optional</Text>
                  </View>
                )}
              </View>
              <Text style={styles.ingQty} numberOfLines={1} ellipsizeMode="tail">
                {ing.quantity}
              </Text>
            </View>
          );
        })}
        <View style={styles.legend}>
          <Legend color={colors.green} label="Have" />
          <Legend color={colors.accent} label="To buy" />
          <Legend color={colors.textFaint} label="Optional" />
        </View>
      </View>

      <Text style={styles.section}>Steps</Text>
      <View style={styles.card}>
        {d.steps.map((step, i) => (
          <View
            key={i}
            style={[styles.stepRow, i === d.steps.length - 1 && styles.lastRow]}
          >
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {d.tips?.length > 0 && (
        <>
          <Text style={styles.section}>Tips</Text>
          <View style={styles.card}>
            {d.tips.map((tip, i) => (
              <Text key={i} style={styles.tip}>
                💡 {tip}
              </Text>
            ))}
          </View>
        </>
      )}

      <Text style={styles.section}>Nutrition · per serving</Text>
      <View style={[styles.card, styles.nutriRow]}>
        <Stat label="Calories" value={d.nutritionPerServing.calories} />
        <Stat label="Protein" value={d.nutritionPerServing.protein} />
        <Stat label="Carbs" value={d.nutritionPerServing.carbs} />
        <Stat label="Fat" value={d.nutritionPerServing.fat} />
      </View>
      </>
      )}

      <View style={{ height: space(10) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(4) },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  loadingText: { color: colors.textMuted, marginTop: space(3), fontSize: 15 },
  errorText: { color: colors.red, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  retry: {
    marginTop: space(4),
    backgroundColor: withAlpha(colors.accent, 0.13),
    borderRadius: radius.pill,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  retryText: { color: colors.accent, fontWeight: '600' },

  inlineLoad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(6),
    gap: space(2),
  },
  inlineLoadText: { color: colors.textMuted, fontSize: 14 },
  errorBox: {
    backgroundColor: withAlpha(colors.red, 0.1),
    borderRadius: radius.md,
    padding: space(4),
    marginTop: space(5),
    alignItems: 'center',
  },

  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 33,
    letterSpacing: -0.5,
  },
  desc: { color: colors.textMuted, fontSize: 15.5, marginTop: space(2.5), lineHeight: 22 },

  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginTop: space(5),
    overflow: 'hidden',
  },
  stat: {
    width: '50%',
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: space(2),
    paddingVertical: space(3.5),
  },
  statBorderRight: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.hairline },
  statBorderBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  statLabel: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: space(1.5),
    letterSpacing: 0.3,
  },

  section: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    marginTop: space(7),
    marginBottom: space(3.5),
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space(5),
    paddingVertical: space(2),
  },

  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space(3.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  ingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: space(3) },
  ingItem: { color: colors.text, fontSize: 15.5, flexShrink: 1, minWidth: 0 },
  ingItemOptional: { color: colors.textMuted },
  optTag: {
    marginLeft: space(2),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  optTagText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  ingQty: {
    color: colors.textMuted,
    fontSize: 14.5,
    marginLeft: space(3),
    flexShrink: 1,
    maxWidth: '48%',
    textAlign: 'right',
  },
  lastRow: { borderBottomWidth: 0 },
  legend: {
    flexDirection: 'row',
    gap: space(4),
    paddingVertical: space(4),
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendText: { color: colors.textMuted, fontSize: 12.5 },

  stepRow: {
    flexDirection: 'row',
    paddingVertical: space(3.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: withAlpha(colors.accent, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space(3.5),
  },
  stepNumText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  stepText: { color: colors.text, fontSize: 15.5, flex: 1, lineHeight: 23 },

  tip: { color: colors.text, fontSize: 14.5, lineHeight: 22, paddingVertical: space(2) },

  nutriRow: { flexDirection: 'row' },
});
