# App Review reply — Submission ID 5682100c-e1dc-40d2-9b5e-9046608b4e6d

Paste the block below into **App Store Connect → App Review → Reply**, after
uploading the new build and changing the age rating (see the checklist at the end).

No placeholders left to fill — the demo credentials are verified working as of
2026-09-05.

---

## Message to App Review

Hello, and thank you for the detailed review — all three items are addressed in
build 14, which is now attached to this submission.

**Guideline 2.5.1 — HealthKit was not identified in the app's interface**

You were right, and it was worse than a labelling problem: nothing in the app was
calling HealthKit at all. The screen that used to read from it had been removed in
an earlier revision, so the framework was linked with no interface behind it.

Build 14 adds an **"Apple Health" card on the Home tab** — the first tab shown
after signing in, with no menu or setting to open. It sits directly above the list
of the day's items that it fills in (below the progress ring; a short scroll may be
needed on a smaller display). The card:

- is titled "Apple Health" and names Apple Health in its description,
- explains exactly what is read: exercise minutes and sleep hours,
- explains what those two figures are used for: filling in the Exercise, Around
  practice and Sleep items in the list directly below it,
- has a "Connect Apple Health" button that triggers the authorization request,
- states plainly that the app only reads these two values, never writes anything
  back to Apple Health, and never shares them with anyone other than the athlete's
  coach,
- tells the user how to revoke access (Health app → Sharing, or Settings →
  Privacy & Security → Health).

The card is shown whether or not health data is available, so the disclosure is
present on every device.

One note in case it comes up on the review device: the app requests a HealthKit
*write* permission that it never uses. Apple requires
`NSHealthUpdateUsageDescription` whenever the framework is linked, so the string is
present, but the app performs read queries only. This is stated in the card's text
rather than left for the user to wonder about.

**Guideline 1.4.1 — medical/health guidance without citations**

Build 14 adds a **"Where this guidance comes from"** section listing the sources
behind every health recommendation in the app, with tappable links to the primary
documents. It appears:

- on the **Nutrition companion** screen you cited — visible *before* any meal photo
  is taken, and directly beneath the result once an analysis has run,
- on the Home screen, next to the activity and sleep targets,
- on the ZenFit (wellbeing/sleep) screen,
- in the Profile tab, as a single consolidated list.

The sources are:

- U.S. Dietary Guidelines for Americans and MyPlate (health.gov, USDA)
- USDA FoodData Central
- Academy of Nutrition and Dietetics (eatright.org)
- American Academy of Pediatrics (HealthyChildren.org) — nutrition, sleep, fitness
  and emotional wellness
- World Health Organization — healthy diet, physical activity, adolescent mental
  health
- American Academy of Sleep Medicine — pediatric sleep duration position statements
- U.S. Physical Activity Guidelines for Americans (health.gov)

Each of these screens also carries an explicit disclaimer, in language written for
a young reader, stating that the app offers general wellness guidance rather than
medical advice, diagnosis or treatment, and that the athlete should talk to a
doctor, a dietitian or their parent or guardian before changing what they eat or how
they train — particularly if they have an allergy, a health condition or an injury.

The app does not diagnose, does not calculate calorie or macronutrient targets for
weight change, and does not recommend supplements or restrictive diets.

**Guideline 2.3.6 — age rating and Messaging and Chat**

We have updated the Age Rating questionnaire to answer **Yes** to Messaging and
Chat. The app does contain a messaging feature and the previous rating did not
reflect it.

For context on how narrow that feature is, since the app is used by children in a
supervised program:

- Messaging is **one-to-one only**. There are no group chats, no public posts, no
  comments and no shared feeds.
- An athlete can message **only two destinations**: the coach they are already
  linked to, and the app's own AI assistant. This is enforced server-side on every
  send, not just hidden in the UI — a request to any other recipient is rejected.
- There is **no way to discover or contact another athlete**. There is no user
  search, no user directory, no public profiles, and athletes are not visible to
  one another anywhere in the app.
- Athletes cannot create an unattached account: joining requires an **invite code
  issued by a coach**, which is what creates the coach–athlete link in the first
  place. No link, no messaging.
- Coaches are staff of the program that runs the app, not members of the public.

We are happy to make any further change you would recommend here.

**If it would help**

We can provide a screen recording showing the Apple Health card on the Home tab and
the citation sections on the Nutrition and Home screens, if that is faster than
navigating the build. Please just ask and we will attach it.

Demo credentials, also in the App Review Information section:

- Athlete account: `reviewer.student@healthyfutures.app` / `AppReview2026!`
- Coach account: `reviewer.coach@healthyfutures.app` / `AppReview2026!`

Signing in as the athlete lands on the Home tab, where the Apple Health card sits
above the day's list and the citation section immediately below it. The account has
seeded data so the screens are populated rather than empty.

Thank you again for the thorough review.

---

## Before you resubmit

Build 14 is already attached and shows **Ready for Review**, so there is nothing
left to upload. Do these in order — the age rating change must land *before* you
press Resubmit, or 2.3.6 comes straight back.

1. **Age rating (this is the entire 2.3.6 fix).**
   App Store Connect → Healthy Futures Athletics → **App Information** in the left
   sidebar → **Age Rating → Edit** → set **Messaging and Chat = Yes** → Save.
   - Heads-up: this can raise the calculated age rating, and Apple sometimes
     follows up on apps with child-facing chat asking about content moderation,
     reporting and blocking. The app currently has no in-app report/block control.
     If they ask for one, that is a code change, not a metadata change.

2. **App Review Information → Notes.** Apple explicitly asked for this "for future
   submissions", so fill it in even though build 14 now contains the disclosure.
   Paste:

   > HealthKit disclosure: sign in as reviewer.student@healthyfutures.app and stay
   > on the Home tab (the tab shown at launch). Scroll past the progress ring — the
   > card titled "Apple Health" sits directly above the list of the day's items. It
   > names Apple Health, states that only exercise minutes and sleep hours are read,
   > states that the app never writes to Apple Health, and has a "Connect Apple
   > Health" button. Health guidance citations appear under "Where this guidance
   > comes from" on that same Home tab and on the Nutrition companion screen.

3. **Sign-In Information** — confirm it holds
   `reviewer.student@healthyfutures.app` / `AppReview2026!` and that "Sign-in
   required" is ticked. Both accounts were confirmed working on 2026-09-05.

4. **Reply to App Review** — paste the message above.

5. **Resubmit to App Review.**

### Optional but recommended: the screen recording

Apple asked for "a screen recording on a physical device showing where this
identification can be found." Build 14 is in TestFlight now, so you can install it
on a physical iPhone, open the Home tab, and screen-record about ten seconds:
launch → scroll to the "Apple Health" card → tap "Connect Apple Health" → show the
permission sheet. Attach it to the reply.

This is worth the ten minutes. The reviewer used an iPad, where the app runs in
iPhone compatibility mode and the card needs a scroll to reach — a recording removes
any chance they miss it and re-reject 2.5.1 a second time.
