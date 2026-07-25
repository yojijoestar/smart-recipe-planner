import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import RecipeCard from '../components/RecipeCard';
import ScreenHeader from '../components/ScreenHeader';
import ScanningPhoto from '../components/ScanningPhoto';
import { detectIngredients, generateRecipes } from '../api/claude';
import { prefetchDetails, clearDetailCache } from '../api/detailCache';
import { getApiKey } from '../storage/settings';
import { showAlert } from '../utils/alert';
import { colors, radius, space, withAlpha } from '../theme';

export default function HomeScreen({ navigation }) {
  const [apiKey, setApiKeyState] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [seenTitles, setSeenTitles] = useState([]);
  // Every recipe ever shown for the ACTIVE mode (including the current 5) —
  // the "Previously shown" section renders this, and future generations for
  // this mode are told to avoid every title in it. Separate per mode (see
  // modeCacheRef), so refreshing one style never touches the other's history.
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editingIngredients, setEditingIngredients] = useState(false);
  const [newIngredient, setNewIngredient] = useState('');
  const [dirty, setDirty] = useState(false); // ingredients changed since last generation
  const [mode, setMode] = useState('onHand'); // 'onHand' | 'inspireMe'
  const [switchingMode, setSwitchingMode] = useState(false);
  // Per-mode snapshot of the last generated list PLUS the full history of
  // every recipe ever shown in that mode, so toggling "Focus on what I have"
  // <-> "Inspire me" restores the previous list instantly instead of
  // re-generating, and each mode's "avoid repeats" instruction and browsable
  // history are built from that mode's own recipes only — refreshing one
  // style never touches the other's cache or history. Recipe ids are
  // preserved across refreshes, so prefetched detail-cache entries stay
  // valid. Invalidated wholesale whenever the underlying ingredient set
  // changes (new photo, edited ingredients).
  const modeCacheRef = useRef({}); // { [mode]: { recipes, seenTitles, history } }
  // Tracks which mode is actually on screen right now, readable synchronously
  // inside async callbacks (state itself is only current as of the last
  // render). Lets a background generation for a mode the user has since
  // switched away from update the cache without clobbering what's visible.
  const activeModeRef = useRef(mode);
  useEffect(() => {
    activeModeRef.current = mode;
  }, [mode]);
  // In-flight generation promises per mode, so rapidly toggling back and forth
  // never fires duplicate requests for the same mode.
  const pendingGenRef = useRef({}); // { [mode]: Promise }
  // Which mode the CURRENTLY DISPLAYED `recipes` actually belongs to. This is
  // deliberately separate from `mode` state / activeModeRef: setMode(next)
  // commits immediately, but `recipes` only catches up later (after an await).
  // If a second mode-switch fires in that gap, code reading `mode` state would
  // see the new mode paired with the OLD mode's still-displayed recipes, and
  // cache that stale list under the wrong mode's key — which is exactly the
  // "both modes end up showing the same 5 recipes" bug. Always pairing
  // `recipes` with this ref instead keeps the two in sync no matter how fast
  // the user toggles.
  const displayedModeRef = useRef(mode);
  // Which mode the in-flight `refresh()` call (if any) is actually FOR. The
  // `refreshing` boolean alone isn't enough to gate the button's spinner/text
  // — it stays true until that background request finishes regardless of
  // what mode the user has since switched to, so without this, refreshing
  // one style would show "Finding 5 new recipes…" on the OTHER style's
  // button too, even though it wasn't touched.
  const refreshModeRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      getApiKey().then(setApiKeyState);
    }, [])
  );

  const requireKey = async () => {
    const key = await getApiKey();
    setApiKeyState(key);
    if (!key) {
      showAlert(
        'API key needed',
        'Add your Anthropic API key in Settings so the app can read your photo and build recipes.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
        ]
      );
      return null;
    }
    return key;
  };

  const pickImage = async (fromCamera) => {
    const key = await requireKey();
    if (!key) return;

    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(
        'Permission needed',
        fromCamera
          ? 'Please allow camera access to continue.'
          : 'Please allow photo access to continue.'
      );
      return;
    }

    const opts = { quality: 0.5, base64: true, mediaTypes: ['images'] };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return;

    const asset = result.assets[0];
    const mt = asset.mimeType || 'image/jpeg';
    setPhotoUri(asset.uri);
    setImageBase64(asset.base64);
    setMediaType(mt);
    await analyze(asset.base64, mt, key);
  };

  const analyze = async (base64, mt, key) => {
    setLoading(true);
    setError(null);
    setRecipes([]);
    setIngredients([]);
    setSeenTitles([]);
    setHistory([]);
    setShowHistory(false);
    clearDetailCache();
    modeCacheRef.current = {}; // new photo — both modes' cached lists and history are now stale
    try {
      // Two calls, on purpose: detect ingredients from the photo (the only
      // place the image is ever sent), then generate recipes from that text
      // list — the same call every refresh/mode-switch/edit later reuses.
      const { ingredients: found } = await detectIngredients({
        apiKey: key,
        imageBase64: base64,
        mediaType: mt,
      });
      const { recipes: got } = await generateRecipes({ apiKey: key, ingredients: found, mode });
      const titles = got.map((r) => r.title);
      setIngredients(found);
      setRecipes(got);
      setSeenTitles(titles);
      setHistory(got);
      displayedModeRef.current = mode;
      // Warm every recipe's full detail in the background so taps are instant.
      prefetchDetails(key, got, found, mode, reconcileToBuyCount);
      modeCacheRef.current[mode] = { recipes: got, seenTitles: titles, history: got };
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!ingredients.length) return;
    const key = await requireKey();
    if (!key) return;
    // Which mode this refresh is FOR, captured once and stable for the rest
    // of this call — independent of whatever `mode` state does afterward if
    // the user toggles away before the request finishes.
    const refreshMode = mode;
    refreshModeRef.current = refreshMode;
    setRefreshing(true);
    setError(null);
    // No clearDetailCache() here — the new recipes get fresh ids, so old cached
    // details just go unused rather than colliding; nuking the whole cache would
    // also wipe the other mode's still-valid cached list for no reason.
    try {
      const { recipes: got } = await generateRecipes({
        apiKey: key,
        ingredients,
        excludeTitles: seenTitles,
        mode: refreshMode,
      });
      const nextSeenTitles = [...seenTitles, ...got.map((r) => r.title)];
      const nextHistory = [...history, ...got];
      modeCacheRef.current[refreshMode] = {
        recipes: got,
        seenTitles: nextSeenTitles,
        history: nextHistory,
      };
      prefetchDetails(key, got, ingredients, refreshMode, reconcileToBuyCount);
      // Only touch the visible list if the user is still on the mode this
      // refresh was for — otherwise it just updates that mode's cache in the
      // background so the fresh 5 are there next time they switch back to
      // it, instead of overwriting whatever the OTHER mode is showing now.
      if (activeModeRef.current === refreshMode) {
        setRecipes(got);
        setSeenTitles(nextSeenTitles);
        setHistory(nextHistory);
        displayedModeRef.current = refreshMode;
      }
    } catch (e) {
      if (activeModeRef.current === refreshMode) setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const removeIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const addIngredient = () => {
    const val = newIngredient.trim();
    if (!val) return;
    if (ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
      setNewIngredient('');
      return;
    }
    setIngredients((prev) => [...prev, val]);
    setNewIngredient('');
    setDirty(true);
  };

  const regenerateFromEditedIngredients = async () => {
    if (!ingredients.length) return;
    const key = await requireKey();
    if (!key) return;
    setEditingIngredients(false);
    setError(null);
    setRecipes([]);
    setSeenTitles([]);
    setHistory([]);
    setShowHistory(false);
    setDirty(false);
    clearDetailCache();
    modeCacheRef.current = {}; // ingredients changed — both modes' cached lists and history are stale
    // Ingredients are already known (no new photo), so this only needs the
    // lightweight "updating recipes" spinner, not the full photo-scanning
    // screen — that's reserved for actually analyzing a new photo.
    setSwitchingMode(true);
    try {
      const { recipes: got } = await generateRecipes({ apiKey: key, ingredients, mode });
      const titles = got.map((r) => r.title);
      setRecipes(got);
      setSeenTitles(titles);
      setHistory(got);
      displayedModeRef.current = mode;
      prefetchDetails(key, got, ingredients, mode, reconcileToBuyCount);
      modeCacheRef.current[mode] = { recipes: got, seenTitles: titles, history: got };
    } catch (e) {
      setError(e.message);
    } finally {
      setSwitchingMode(false);
    }
  };

  const openRecipe = (recipe) => {
    navigation.navigate('RecipeDetail', { recipe, ingredients, mode });
  };

  // The list-level "to buy" count is a rough guess made before the full recipe
  // is written out. Once the background prefetch resolves the real ingredient
  // breakdown, patch the card in place with the authoritative count so it
  // never disagrees with what the detail screen actually shows. Also patches
  // any mode-cache snapshot holding this recipe, so switching back to a
  // backgrounded mode later still shows the corrected count, not the stale
  // guess it had when it was cached.
  const reconcileToBuyCount = (recipeId, detail) => {
    const realToBuy = (detail.ingredients || [])
      .filter((ing) => !ing.fromPhoto && !ing.optional)
      .map((ing) => ing.item);
    const patch = (list) =>
      list.map((r) => (r.id === recipeId ? { ...r, pantryStaplesNeeded: realToBuy } : r));
    setRecipes((prev) => patch(prev));
    setHistory((prev) => patch(prev));
    Object.values(modeCacheRef.current).forEach((entry) => {
      if (entry) {
        entry.recipes = patch(entry.recipes);
        entry.history = patch(entry.history);
      }
    });
  };

  // Generates (or reuses an already in-flight generation of) a mode's recipe
  // list, then updates the cache. Only touches visible state (recipes,
  // seenTitles, switchingMode) if the user is still looking at that mode when
  // it resolves — so switching away mid-generation and back to a cached mode
  // never gets clobbered by a slower request for the mode left behind.
  const generateForMode = (targetMode, key) => {
    if (pendingGenRef.current[targetMode]) return pendingGenRef.current[targetMode];

    const promise = generateRecipes({ apiKey: key, ingredients, mode: targetMode })
      .then(({ recipes: got }) => {
        const nextSeenTitles = got.map((r) => r.title);
        modeCacheRef.current[targetMode] = {
          recipes: got,
          seenTitles: nextSeenTitles,
          history: got, // first time this mode has ever been generated
        };
        prefetchDetails(key, got, ingredients, targetMode, reconcileToBuyCount);
        if (activeModeRef.current === targetMode) {
          setRecipes(got);
          setSeenTitles(nextSeenTitles);
          setHistory(got);
          setSwitchingMode(false);
          displayedModeRef.current = targetMode;
        }
        return got;
      })
      .catch((e) => {
        if (activeModeRef.current === targetMode) {
          setError(e.message);
          setSwitchingMode(false);
        }
        throw e;
      })
      .finally(() => {
        delete pendingGenRef.current[targetMode];
      });

    pendingGenRef.current[targetMode] = promise;
    return promise;
  };

  const changeMode = async (next) => {
    if (next === mode) return;

    // Snapshot what's currently on screen before leaving it — keyed by
    // displayedModeRef (which mode `recipes` truly belongs to right now),
    // NOT the `mode` state. `mode` can already have moved on to a newer
    // switch by the time this runs (see the comment on displayedModeRef),
    // so keying by `mode` here would file the wrong mode's recipes under
    // the wrong cache key.
    if (recipes.length && !switchingMode) {
      modeCacheRef.current[displayedModeRef.current] = { recipes, seenTitles, history };
    }

    // Already have this mode's list from earlier — restore instantly, no API
    // call, even while some OTHER mode is still generating in the background.
    // Recipe ids are unchanged, so prefetched detail-cache entries (if any)
    // are still valid too.
    const cached = modeCacheRef.current[next];
    if (ingredients.length && cached) {
      setMode(next);
      setError(null);
      setSwitchingMode(false);
      setRecipes(cached.recipes);
      setSeenTitles(cached.seenTitles);
      setHistory(cached.history || cached.recipes);
      setShowHistory(false);
      displayedModeRef.current = next;
      return;
    }

    setMode(next);
    if (!ingredients.length) return;

    const key = await requireKey();
    if (!key) {
      setMode(mode); // revert the toggle since we couldn't proceed
      return;
    }

    // The user may have already switched to yet another (possibly cached)
    // mode while we were waiting on the key — only touch the visible loading
    // state if `next` is still what's actually on screen; otherwise just let
    // generateForMode run quietly in the background to warm the cache,
    // without disturbing whatever the user is currently looking at.
    if (activeModeRef.current === next) {
      setError(null);
      setSwitchingMode(true);
      setRecipes([]);
      setSeenTitles([]);
      setHistory([]);
      setShowHistory(false);
    }
    generateForMode(next, key);
  };

  const hasResults = recipes.length > 0;
  // History includes the current 5 (so it's always a superset); the
  // "Previously shown" list should only surface ones since replaced.
  const pastRecipes = history.filter((h) => !recipes.some((r) => r.id === h.id));
  // Only show the refresh button's "in progress" state if THIS mode is the
  // one actually being refreshed — a background refresh for the other mode
  // shouldn't make this one look like it's loading too.
  const isRefreshingThisMode = refreshing && refreshModeRef.current === mode;

  const ModeToggle = (
    <View style={styles.modeBox}>
      <Text style={styles.modeLabel}>Recipe style</Text>
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => changeMode('onHand')}
          style={[styles.modeBtn, mode === 'onHand' && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === 'onHand' && styles.modeBtnTextActive]}>
            Only with ingredients I have
          </Text>
        </Pressable>
        <Pressable
          onPress={() => changeMode('inspireMe')}
          style={[styles.modeBtn, mode === 'inspireMe' && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === 'inspireMe' && styles.modeBtnTextActive]}>
            I'm open to buy more ingredients
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const Header = (
    <View>
      {photoUri && (
        <View style={styles.photoWrap}>
          <Image source={{ uri: photoUri }} style={styles.photo} />
          {ingredients.length > 0 && (
            <View style={styles.ingredientBox}>
              <View style={styles.ingredientHeaderRow}>
                <Text style={styles.ingredientLabel}>Detected ingredients</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setEditingIngredients((v) => !v)}
                >
                  <Text style={styles.editLink}>
                    {editingIngredients ? 'Done' : 'Edit'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.chipWrap}>
                {ingredients.map((ing, i) => (
                  <View
                    key={`${ing}-${i}`}
                    style={[styles.ingChip, editingIngredients && styles.ingChipEditing]}
                  >
                    <Text style={styles.ingChipText}>{ing}</Text>
                    {editingIngredients && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => removeIngredient(i)}
                        style={styles.chipRemove}
                      >
                        <Text style={styles.chipRemoveText}>×</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>

              {editingIngredients && (
                <View style={styles.addRow}>
                  <TextInput
                    value={newIngredient}
                    onChangeText={setNewIngredient}
                    onSubmitEditing={addIngredient}
                    placeholder="Add an ingredient…"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="done"
                    style={styles.addInput}
                  />
                  <Pressable
                    onPress={addIngredient}
                    style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.addBtnText}>Add</Text>
                  </Pressable>
                </View>
              )}

              {dirty && !editingIngredients && (
                <Pressable
                  onPress={regenerateFromEditedIngredients}
                  style={({ pressed }) => [styles.updateBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.updateBtnText}>Update recipes with these ingredients</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {ModeToggle}

      {hasResults && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>5 recipes you can make</Text>
          <Text style={styles.resultsSub}>Tap any recipe for the full method.</Text>
          <Pressable
            onPress={refresh}
            disabled={isRefreshingThisMode}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          >
            {isRefreshingThisMode ? (
              <>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.refreshText}>Finding 5 new recipes…</Text>
              </>
            ) : (
              <Text style={styles.refreshText}>↻  Refresh to get 5 new recipes</Text>
            )}
          </Pressable>
        </View>
      )}

      {pastRecipes.length > 0 && (
        <View style={styles.historyBox}>
          <Pressable
            onPress={() => setShowHistory((v) => !v)}
            style={({ pressed }) => [styles.historyToggle, pressed && styles.pressed]}
          >
            <Text style={styles.historyToggleText}>
              {showHistory ? 'Hide' : 'Show'} previously shown recipes ({pastRecipes.length})
            </Text>
            <Text style={styles.historyChevron}>{showHistory ? '︿' : '﹀'}</Text>
          </Pressable>
          {showHistory && (
            <View style={styles.historyList}>
              {pastRecipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} onPress={() => openRecipe(r)} />
              ))}
            </View>
          )}
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Smart Recipe Planner"
        rightLabel="Settings"
        onRightPress={() => navigation.navigate('Settings')}
      />
      {loading ? (
        <View style={styles.scanCenter}>
          {photoUri ? (
            <ScanningPhoto uri={photoUri} height={320} />
          ) : (
            <ActivityIndicator color={colors.accent} size="large" />
          )}
          <Text style={styles.loadingText}>Reading your ingredients…</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RecipeCard recipe={item} onPress={() => openRecipe(item)} />
          )}
          ListHeaderComponent={Header}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            switchingMode ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={styles.loadingText}>Updating your recipes…</Text>
              </View>
            ) : !hasResults && !error ? (
              <View style={styles.empty}>
                <View style={styles.emptyMark}>
                  <Text style={styles.emptyMarkText}>🥘</Text>
                </View>
                <Text style={styles.emptyTitle}>What's in your kitchen?</Text>
                <Text style={styles.emptyBody}>
                  Snap a photo of your ingredients and get 5 recipes you can make with
                  those ingredients!
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <View style={styles.actionBar}>
        <Pressable
          onPress={() => pickImage(true)}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>📷 Take photo</Text>
        </Pressable>
        <Pressable
          onPress={() => pickImage(false)}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Library</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: space(5), paddingBottom: space(30) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  loadingText: { color: colors.textMuted, marginTop: space(4), fontSize: 15 },

  modeBox: { marginBottom: space(5) },
  modeLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '600', marginBottom: space(2.5) },
  modeRow: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space(1) },
  modeBtn: {
    flex: 1,
    paddingVertical: space(3),
    paddingHorizontal: space(1.5),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  modeBtnText: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  modeBtnTextActive: { color: colors.text },

  photoWrap: { marginBottom: space(5) },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  ingredientBox: { marginTop: space(4) },
  ingredientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(2.5),
  },
  ingredientLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },
  editLink: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  ingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
  },
  ingChipEditing: {
    backgroundColor: withAlpha(colors.accent, 0.08),
    borderColor: withAlpha(colors.accent, 0.3),
  },
  ingChipText: { color: colors.text, fontSize: 13.5, fontWeight: '500' },
  chipRemove: { marginLeft: space(2) },
  chipRemoveText: { color: colors.textFaint, fontSize: 15, fontWeight: '700' },

  addRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  addInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
    color: colors.text,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space(4.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.accentInk, fontSize: 14, fontWeight: '700' },

  updateBtn: {
    marginTop: space(3.5),
    backgroundColor: withAlpha(colors.accent, 0.13),
    borderRadius: radius.md,
    paddingVertical: space(3.5),
    alignItems: 'center',
  },
  updateBtnText: { color: colors.accent, fontSize: 14.5, fontWeight: '600' },

  resultsHeader: { marginBottom: space(4) },
  resultsTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  resultsSub: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: space(1.5),
    marginBottom: space(4),
  },
  refreshBtn: {
    flexDirection: 'row',
    gap: space(2),
    backgroundColor: withAlpha(colors.accent, 0.13),
    borderRadius: radius.md,
    paddingVertical: space(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: { color: colors.accent, fontWeight: '600', fontSize: 15 },

  historyBox: { marginBottom: space(4) },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: space(3.5),
    paddingHorizontal: space(4),
  },
  historyToggleText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  historyChevron: { color: colors.textFaint, fontSize: 13 },
  historyList: { marginTop: space(3) },

  errorBox: {
    backgroundColor: withAlpha(colors.red, 0.1),
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(4),
  },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 20 },

  empty: { alignItems: 'center', paddingTop: space(24), paddingHorizontal: space(8) },
  emptyMark: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMarkText: { fontSize: 40 },
  emptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: space(6),
    letterSpacing: -0.4,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 15.5,
    textAlign: 'center',
    marginTop: space(3),
    lineHeight: 23,
  },

  actionBar: {
    position: 'absolute',
    left: space(5),
    right: space(5),
    bottom: space(9),
    flexDirection: 'row',
    gap: space(3),
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space(4.5),
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryText: { color: colors.accentInk, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    paddingVertical: space(4.5),
    paddingHorizontal: space(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
