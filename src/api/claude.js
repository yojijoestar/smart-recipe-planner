// Claude API integration for the Smart Recipe Planner.
// Three capabilities, each its own tool_use schema so every response is typed
// and nothing is echoed back that the caller doesn't actually use:
//   1) detectIngredients(): vision-only — a photo in, an ingredient list out.
//      Called exactly once, right after a photo is taken/picked.
//   2) generateRecipes(): a known ingredient list in, exactly 5 structured
//      recipe summaries out, excluding any already shown so refreshes never
//      repeat. Never touches the photo — by the time this runs, the
//      ingredient list (possibly hand-edited) is already the source of truth.
//   3) generateRecipeDetail(): expand one summary into a full structured recipe.
//
// We force structured output via tool_use so we never parse free-form text.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap + vision-capable
const ANTHROPIC_VERSION = '2023-06-01';

async function callClaude({ apiKey, system, content, tool, maxTokens = 2048 }) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (e) {
    throw new Error('Network error — check your connection and try again.');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {}
    if (res.status === 401) {
      throw new Error('Invalid API key. Update it in Settings.');
    }
    if (res.status === 429) {
      throw new Error('Rate limit or quota reached. Try again shortly.');
    }
    throw new Error(detail || `Request failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === 'tool_use');
  if (!block || !block.input) {
    throw new Error('Unexpected response from Claude. Please try again.');
  }
  return block.input;
}

const INGREDIENTS_TOOL = {
  name: 'present_ingredients',
  description: 'Return the food ingredients identified in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        description: 'Food ingredients identified in the photo.',
        items: { type: 'string' },
      },
    },
    required: ['ingredients'],
  },
};

const RECIPES_TOOL = {
  name: 'present_recipes',
  description: 'Return exactly 5 recipe ideas for the given ingredients.',
  input_schema: {
    type: 'object',
    properties: {
      recipes: {
        type: 'array',
        description: 'Exactly 5 distinct recipes.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: {
              type: 'string',
              description: 'One appetizing sentence.',
            },
            cuisine: { type: 'string' },
            difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
            timeMinutes: { type: 'integer' },
            servings: { type: 'integer' },
            usesFromPhoto: {
              type: 'array',
              description: 'Detected ingredients this recipe uses.',
              items: { type: 'string' },
            },
            pantryStaplesNeeded: {
              type: 'array',
              description:
                'Items the cook must actually buy: not visible in the photo, not ' +
                'optional/skippable, and NOT one of the assumed pantry staples (oil, ' +
                'salt, pepper, water, sugar) — those are always on hand and must never ' +
                'appear in this list.',
              items: { type: 'string' },
            },
          },
          required: [
            'title',
            'description',
            'cuisine',
            'difficulty',
            'timeMinutes',
            'servings',
            'usesFromPhoto',
            'pantryStaplesNeeded',
          ],
        },
      },
    },
    required: ['recipes'],
  },
};

const DETAIL_TOOL = {
  name: 'present_recipe_detail',
  description: 'Return one complete, structured recipe.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      cuisine: { type: 'string' },
      difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
      timeMinutes: { type: 'integer' },
      servings: { type: 'integer' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string' },
            quantity: { type: 'string' },
            fromPhoto: {
              type: 'boolean',
              description: 'True if the cook already has this (on hand).',
            },
            optional: {
              type: 'boolean',
              description:
                'True if the dish works fine without it (garnish, nice-to-have). ' +
                'Optional items are never counted as required to buy.',
            },
          },
          required: ['item', 'quantity', 'fromPhoto', 'optional'],
        },
      },
      steps: {
        type: 'array',
        description: 'Ordered cooking steps, each one clear action.',
        items: { type: 'string' },
      },
      tips: { type: 'array', items: { type: 'string' } },
      nutritionPerServing: {
        type: 'object',
        properties: {
          calories: { type: 'string' },
          protein: { type: 'string' },
          carbs: { type: 'string' },
          fat: { type: 'string' },
        },
        required: ['calories', 'protein', 'carbs', 'fat'],
      },
    },
    required: [
      'title',
      'description',
      'cuisine',
      'difficulty',
      'timeMinutes',
      'servings',
      'ingredients',
      'steps',
      'tips',
      'nutritionPerServing',
    ],
  },
};

let idCounter = 0;
const nextId = () => `r${Date.now()}_${idCounter++}`;

// The only items assumed always on hand and NEVER counted as something to buy.
// Kept short and explicit on purpose — every "to buy" inflation bug so far has
// come from the model quietly counting one of these as a purchase.
const PANTRY_STAPLES = 'oil, salt, pepper, water, and sugar';

// mode: 'onHand' biases toward zero/near-zero shopping; 'inspireMe' allows
// more adventurous recipes that may need extra ingredients.
const MODE_NOTE = {
  onHand:
    'This is a "focus on what I have" request — the hard constraint is ZERO extra ' +
    `purchases. Every one of the 5 recipes MUST be makeable using ONLY the detected ` +
    `ingredients plus these assumed pantry staples: ${PANTRY_STAPLES}. Do not include ` +
    'a recipe that needs any item beyond that, even one small one (not a sauce, not a ' +
    'second spice, not a garnish) — think harder and pick a different recipe instead of ' +
    'reaching for an extra ingredient. Before finalizing each recipe, re-check every ' +
    'ingredient it uses against the detected list + staples; if anything is not on ' +
    'either list, that recipe is invalid for this request and must be replaced. Only if ' +
    'it is truly impossible to find 5 distinct zero-purchase recipes should a recipe ' +
    'need 1 extra item, and never more than 1.',
  inspireMe:
    'Prioritize variety and inspiration over minimizing shopping — it is fine, even ' +
    'encouraged, for recipes to call for a few extra ingredients beyond what is on ' +
    'hand if it makes for a more interesting or delicious dish.',
};

// Vision-only: photo in, ingredient list out. Called exactly once, right
// after a photo is taken/picked — nothing downstream ever touches the photo
// again, so this is the only function in the file that sends image data.
export async function detectIngredients({ apiKey, imageBase64, mediaType = 'image/jpeg' }) {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    {
      type: 'text',
      text: 'Identify the edible food ingredients visible in this photo.',
    },
  ];

  const input = await callClaude({
    apiKey,
    system:
      'You are a precise visual food-ingredient identifier. List only what is actually ' +
      'visible and edible in the photo — do not invent or guess at items you cannot see.',
    content,
    tool: INGREDIENTS_TOOL,
    maxTokens: 400,
  });

  return { ingredients: input.ingredients || [] };
}

// Always operates on a known, already-detected (and possibly hand-edited)
// ingredient list — never the photo. Returns exactly 5 recipe summaries.
export async function generateRecipes({ apiKey, ingredients, excludeTitles = [], mode = 'onHand' }) {
  const excludeNote = excludeTitles.length
    ? `\n\nDo NOT suggest any of these already-shown recipes (or close variants): ${excludeTitles
        .map((t) => `"${t}"`)
        .join(', ')}. Every recipe must be clearly different.`
    : '';

  const modeNote = `\n\n${MODE_NOTE[mode] || MODE_NOTE.onHand}`;

  const promptText =
    `The available ingredients are: ${(ingredients || []).join(', ')}. ` +
    'Propose exactly 5 distinct recipes that can be made mostly from them ' +
    `(pantry staples allowed: ${PANTRY_STAPLES}). Favor recipes that use several of them.` +
    modeNote +
    excludeNote;

  const input = await callClaude({
    apiKey,
    system:
      'You are a practical home-cooking assistant. Recipes must be realistic and ' +
      'genuinely distinct from one another. Be concise: each description is ONE short ' +
      'sentence (max 12 words). Keep every field terse to respond fast.',
    content: [{ type: 'text', text: promptText }],
    tool: RECIPES_TOOL,
    maxTokens: 1000,
  });

  const recipes = (input.recipes || []).slice(0, 5).map((r) => ({
    ...r,
    id: nextId(),
    usesFromPhoto: r.usesFromPhoto || [],
    pantryStaplesNeeded: r.pantryStaplesNeeded || [],
  }));

  // Fewest things to buy first — cheapest/easiest recipes surface at the top.
  recipes.sort((a, b) => a.pantryStaplesNeeded.length - b.pantryStaplesNeeded.length);

  return { recipes };
}

export async function generateRecipeDetail({ apiKey, recipe, ingredients = [], mode = 'onHand' }) {
  // The recipe was picked under this mode's shopping bias at list-time — the
  // full write-up must honor the same constraint, or the "to buy" count here
  // will drift from what the card already promised the user.
  const modeConstraint =
    mode === 'onHand'
      ? `This recipe was chosen as a zero-purchase, "focus on what I have" recipe. Write ` +
        `it using ONLY the on-hand ingredients plus these assumed pantry staples: ` +
        `${PANTRY_STAPLES}. Do not introduce any ingredient beyond that combined list, ` +
        'even a small one (not a second spice, not a sauce, not a garnish) — if the ' +
        'recipe as commonly made needs something else, substitute or drop it rather ' +
        'than add a purchase. If truly unavoidable, one extra item is the absolute ' +
        'maximum, and it must be marked fromPhoto=false, optional=false so it correctly ' +
        'counts as something to buy.'
      : 'It is fine for this recipe to call for a few extra ingredients beyond what ' +
        'is on hand, if it makes for a better dish.';
  const content = [
    {
      type: 'text',
      text:
        `Write the full recipe for "${recipe.title}" (${recipe.cuisine}, ` +
        `${recipe.difficulty}, about ${recipe.timeMinutes} minutes, serves ${recipe.servings}). ` +
        `The cook has these ingredients on hand: ${ingredients.join(', ') || 'a typical kitchen'}. ` +
        'Mark which ingredients come from that on-hand list with fromPhoto=true. ' +
        `Pantry staples (${PANTRY_STAPLES}) are ALWAYS assumed to be on hand too — mark ` +
        'them fromPhoto=true even though they were not in the photo, since the cook ' +
        'never needs to buy them. Mark any other ingredient the dish works fine without ' +
        '(garnishes, nice-to-haves) as optional=true. The list of things the cook must ' +
        'actually buy = items that are NOT on hand, NOT a pantry staple, AND NOT ' +
        'optional — keep that list as small as possible and never include a pantry ' +
        'staple in it. ' +
        'Give exact quantities, clear numbered steps, a few helpful tips, and estimated ' +
        `nutrition per serving.\n\n${modeConstraint}`,
    },
  ];

  return callClaude({
    apiKey,
    system:
      'You are a precise recipe writer. Quantities and steps must be realistic and safe. ' +
      'Be concise and fast: each step is one short imperative sentence, max 6 steps, ' +
      'max 3 tips. No preamble.',
    content,
    tool: DETAIL_TOOL,
    maxTokens: 1400,
  });
}
