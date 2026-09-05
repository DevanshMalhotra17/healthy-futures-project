# Google Play submission — Healthy Futures Athletics

**Upload this file:** `C:\Users\devan\Downloads\HealthyFuturesAthletics-v9.aab`
(versionCode 9, versionName 1.0.0, 57.5 MB)

Do **not** upload v7 or v8. Both were built before this session's changes and are
missing the health-guidance citations, the Health Connect card, and the timezone
fix — verified by inspecting their bundles, not assumed.

---

## 1. Recommended: Internal testing before Production

Nothing in this app has ever run on physical Android hardware. Every Android code
path — Health Connect, the camera, video upload, notifications — is unverified on a
real device. Play's Internal testing track installs on your own device in minutes
and does not need review.

Release → Testing → **Internal testing** → Create new release → upload v9 → add
yourself as a tester. Once it runs cleanly, promote the same artifact to Production.

## 2. The long pole: Health Connect declaration

Start this first. Google reviews it separately from the app and it has historically
taken **over a week**, so it gates your launch date more than anything else here.

**Policy → App content → Health apps / Health Connect permissions declaration.**

The app declares exactly two Health Connect permissions and no write permissions —
confirmed from the AAB manifest:

| Permission | Why |
|---|---|
| `android.permission.health.READ_EXERCISE` | Fills in the athlete's daily Exercise item and matches exercise time against that day's practice |
| `android.permission.health.READ_SLEEP` | Fills in the athlete's daily Sleep item against an 8-hour target |

Points to make in the declaration:

- Read-only. The app never writes to Health Connect.
- Only two values leave the device: total exercise minutes for the day and total
  sleep hours for the night, plus the timestamp of the day's longest exercise bout.
- They are shown to the athlete and to the coach who is already linked to them.
  They are not sold, not shared with third parties, and not used for advertising.
- The in-app card names Health Connect, states that the app only reads and never
  writes, and tells the user how to revoke access in the Health Connect app.

## 3. App access (do not skip — the app requires login)

**Policy → App content → App access.** Reviewers cannot get past the sign-in screen
without credentials, and "all functionality is available without restrictions" would
be false. Choose *All or some functionality is restricted* and add:

- Athlete: `reviewer.student@healthyfutures.app` / `AppReview2026!`
- Coach: `reviewer.coach@healthyfutures.app` / `AppReview2026!`

Both verified working 2026-09-05. Add a note that the athlete account shows the
daily routine, Health Connect card and nutrition companion, and the coach account
shows the roster and session scheduling.

## 4. Data safety

**Policy → App content → Data safety.** Based on what the code actually collects:

| Category | Collected | Notes |
|---|---|---|
| Name, email address | Yes | account signup |
| Health and fitness | Yes | exercise minutes, sleep hours from Health Connect |
| Photos | Yes | meal photos for the nutrition companion |
| Videos | Yes | practice clips sent to the coach |
| Audio | Yes | microphone for practice clips and speech-to-text |
| Messages (in-app) | Yes | 1:1 athlete↔coach and athlete↔AI assistant |
| **Face / biometric data** | **Yes** | see the warning below |

All of it is transmitted to your own server and stored there, so declare it as both
*collected* and *stored*, encrypted in transit. Account and data deletion exists in
the app, so you can declare a deletion path — make sure the URL you give matches it.

## 5. Content rating

**Policy → App content → Content rating** questionnaire. Answer **yes** to the
user-interaction / user-communication questions — the app has 1:1 messaging. This is
the same disclosure Apple rejected the iOS build over (guideline 2.3.6), so do not
answer it the way the old iOS age rating was answered.

Expect follow-up questions about whether that communication is moderated. It is
constrained rather than moderated: an athlete can only ever reach their own linked
coach or the AI assistant, enforced server-side, with no user discovery and no way
to contact another athlete. There is **no in-app report or block control**, so answer
the moderation questions accordingly rather than overclaiming.

## 6. Decision you need to make: Target audience — and the face-data risk

**Policy → App content → Target audience and content.**

This is the highest-risk item in the whole submission and it needs your call, not a
default. The athletes using this app are children, so an honest target-audience
answer includes under-13 age bands — which puts the app under Play's **Families
policy** and its extra requirements.

Two features draw scrutiny under that policy:

1. **Face recognition on minors.** The app enrols face embeddings
   (`face_enrollments.embedding`) so practice clips can be matched to the right
   athlete. The foundation is sound — enrolment refuses to proceed without a named
   parent or guardian recorded as consenting, and there is a delete endpoint — but
   collecting biometrics from children is something Google examines closely, and you
   should expect to justify it.
2. **Child-to-adult messaging**, with no report/block control.

Neither is automatically disqualifying, and the guardian-consent gate plus the
narrow messaging model are genuinely defensible. But go in expecting questions, have
your privacy policy explicitly cover face data and guardian consent, and treat a
request for reporting/blocking as a likely outcome — that would be a code change,
not a form change.

If face matching is not essential to launch, disabling it for 1.0 removes the single
largest source of review risk. That is a product decision and it is yours.

## 7. Store listing assets still needed

- Android screenshots (phone; tablet only if you list tablet support — the app is
  built iPhone/phone-only, `supportsTablet: false`)
- Feature graphic, 1024×500
- App icon 512×512, short description (80 chars), full description
- Privacy policy URL — must cover health data, face data, children's data

## 8. Known cosmetic mismatch

The on-device launcher label is **"Healthy Futures"** while the Play listing is
**"Healthy Futures Athletics"**. Not a policy problem, and not worth a rebuild now;
flagged for 1.1 (`app.json` → `expo.name`).
