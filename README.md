# Healthy Futures Project

This zip has two separate projects, kept in their own folders on purpose. They are not
versions of each other. They run in different places and do different jobs.

## /HealthyFuturesApp
The mobile app. Built with Expo/React Native. This is what runs on a phone.

The auth flow (`src/api/client.ts`, `src/api/auth.ts`, `src/state/AuthContext.tsx`,
`src/screens/ProfileScreen.tsx`) is now wired to `healthy-futures-api`'s contract:
signup sends `fullName`, `role`, and `inviteCode` (for students), the app stores the
returned `user` object, and it fetches `/auth/me` to show a coach their invite code or
a student their linked coach. This has NOT been run against a live server yet, since
the backend isn't deployed — see step 1 below.

## /healthy-futures-api
The new backend. Built with Node/Express and its own Postgres database (`healthyfutures`).
This is what runs on the server (the EC2 box, alongside the existing TachyonLeap services).

Tested end to end locally: coach signup, invite code generation, student signup with a
valid/invalid code, roster visibility, and role gating all work against a real database.
Not yet deployed to the actual box. See `healthy-futures-api/README.md` for the deploy steps.

## What's left
1. Deploy `healthy-futures-api` to the box (its own port, its own subdomain — the app is
   already pointed at `https://healthyfutures-api.demo.gomllabs.com/api` in
   `src/api/client.ts`, so either stand it up at that host or update that constant to
   match wherever it actually ends up).
2. Once it's reachable, run the app and do a real signup/login pass (coach, then a
   student using that coach's invite code) to confirm the wiring works end to end. This
   has only been reviewed against the backend's route code, not tested live.
3. Build out the rest: PrimeFit, nutrition, check-ins, soccer sessions, and messaging still
   need their own tables/endpoints in `healthy-futures-api`. HomeScreen, ScheduleScreen,
   MessagesScreen, CompanionsScreen, and mockData.ts are all still untouched and still
   running on mock data.
