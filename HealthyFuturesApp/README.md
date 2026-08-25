# Healthy Futures — React Native (Expo + TypeScript)

Participant app: Home, Companions (Soccer Scorecard, Nutrition, PrimeFit, ZenFit), and Schedule,
matching the approved design prototype.

## Setup (Windows, no Mac needed)

1. Install Node.js (18 or 20 LTS) if you don't have it already.
2. Open this folder in a terminal:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npx expo start
   ```
4. On your iPhone, install the **Expo Go** app from the App Store.
5. Scan the QR code shown in your terminal/browser with your iPhone camera — it opens directly
   in Expo Go with your real code running. No Xcode, no Mac, no App Store submission needed for
   this stage.

Any time you save a file, the app on your phone reloads automatically.

## Project structure

```
App.tsx                        entry point — loads fonts, sets up navigation
src/theme.ts                   colors, spacing, radii, font names
src/data/mockData.ts           sample content (companions, schedule, criteria, scorecard)
src/components/Icons.tsx       shared SVG icon set
src/components/ProgressRing.tsx  the "pitch center-circle" ring used on Home
src/components/CompanionCard.tsx grid + row card for the 4 companions
src/screens/HomeScreen.tsx
src/screens/CompanionsScreen.tsx
src/screens/ScheduleScreen.tsx
src/screens/ProfileScreen.tsx  placeholder — consent/settings not built yet
src/navigation/RootNavigator.tsx bottom tab bar wiring the 4 screens together
```

## Type checking

```
npm run typecheck
```

## Later: real App Store build (still no Mac required)

When you're ready to submit to the App Store, use Expo's cloud build service (EAS) — it builds
the iOS binary on Expo's servers, not your machine:

```
npm install -g eas-cli
eas login
eas build --platform ios
```

You'll still need an active Apple Developer account ($99/year, from Apple — separate from any
Mac requirement) to actually publish to the App Store, but the build itself can run in the cloud.

## Swapping mock data for real data later

Everything in `src/data/mockData.ts` is placeholder content matching the prototype. When the
TachyonLeap APIs are ready, replace the static exports with real fetch calls (e.g. in each
screen's `useEffect`) without needing to change the component code.
