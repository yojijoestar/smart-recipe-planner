# Smart Recipe Planner

**Snap a photo of your ingredients. Get 5 recipes you can actually make.**

Smart Recipe Planner looks at what's really in your kitchen and turns it into cookable ideas — no searching, no typing out a grocery list, no guessing what goes with what. Just take a photo, and get five structured recipes ranked by how little you'd need to buy.

- 📷 **Photograph your ingredients** — the app identifies what's there for you
- 🍳 **Get 5 recipes**, each with time, servings, difficulty, and cuisine at a glance
- 🎯 **Choose your style** — stick to only what you have, or open up to a bit of shopping for something more inspired
- 📖 **Tap in for the full recipe** — exact quantities, step-by-step instructions, tips, and nutrition
- ✏️ **Edit the ingredient list** if anything was missed, and regenerate instantly
- 🔁 **Refresh for 5 new ideas** anytime, without losing track of what you've already seen

## Try it

**On your phone (recommended):**
1. Install **Expo Go** from the iOS App Store.
2. Open this link on your phone: `exp://u.expo.dev/0958c67b-d015-489f-84d6-c0e6c9648f71?runtime-version=1.0.0&channel-name=production`
3. Tap **Settings** → paste an Anthropic API key ([get a free one here](https://console.anthropic.com/settings/keys)) → **Save**. The key stays on your device and is only ever sent to `api.anthropic.com`.
4. Take a photo of some ingredients and go.

**Run from source:**
```bash
git clone <repo-url>
cd smart-recipe-planner
npm install
npx expo start
```
Then scan the QR code with your iPhone's Camera app (phone and computer must be on the same Wi-Fi), or open the printed `exp://` URL directly in Expo Go.

## Requirements

- **Expo Go** on an iPhone (or the iOS Simulator)
- **Node.js** if running from source
- An **Anthropic API key** — a free-tier key is enough to try it out
