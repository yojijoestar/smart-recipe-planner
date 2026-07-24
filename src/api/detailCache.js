// In-memory cache of full recipe details, keyed by recipe id.
// We start generating every card's detail in the background the moment the list
// appears, so opening a recipe is instant (or already in-flight) rather than a
// cold request. Stores the Promise so concurrent callers share one request.
import { generateRecipeDetail } from './claude';

const cache = new Map(); // id -> Promise<detail>

// Return the cached (possibly in-flight) detail promise, starting one if needed.
export function primeDetail(apiKey, recipe, ingredients, mode = 'onHand') {
  if (cache.has(recipe.id)) return cache.get(recipe.id);
  const p = generateRecipeDetail({ apiKey, recipe, ingredients, mode }).catch((e) => {
    cache.delete(recipe.id); // allow a later retry
    throw e;
  });
  cache.set(recipe.id, p);
  return p;
}

// Fire-and-forget warm-up for a whole list of recipes. onEach(recipeId, detail)
// fires as each one resolves, so the caller can reconcile the list card's rough
// "to buy" estimate with the detail screen's authoritative count once it's known.
export function prefetchDetails(apiKey, recipes, ingredients, mode = 'onHand', onEach) {
  if (!apiKey) return;
  recipes.forEach((r) => {
    primeDetail(apiKey, r, ingredients, mode)
      .then((detail) => onEach?.(r.id, detail))
      .catch(() => {}); // swallow background errors; the detail screen retries on demand
  });
}

export function clearDetailCache() {
  cache.clear();
}
