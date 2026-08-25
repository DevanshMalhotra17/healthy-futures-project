# healthy-futures-api

A standalone backend for Healthy Futures — completely separate from
TachyonLeap's services. It has its own database (`healthyfutures`), its own
JWT secret, and its own auth. The only thing it shares with TachyonLeap is
the physical EC2 box (and, later, calls to the GPU-bound compute services
like `soccer-ai-api` — no user data crosses that boundary).

## What this covers so far

- Coach signup (auto-generates a 6-character invite code)
- Student signup (**requires** a valid coach invite code — there is no way
  to create a student account with no coach)
- Login
- `/api/auth/me` — returns the real logged-in user, their role, and (for
  students) their real affiliated coach, or `null` if genuinely unaffiliated
- `/api/coach/roster` — a coach's real list of affiliated students (empty
  array for a brand-new coach, never placeholder rows)

This was tested end-to-end against a real local Postgres instance — signup,
login, invite-code validation (valid/invalid/missing), roster lookup, and
role-based access control (a student hitting `/api/coach/roster` correctly
gets a 403) all verified working before this was packaged.

## Deploy on the EC2 box

You already created the `healthyfutures` role and database. From here:

```bash
# 1. Copy this folder onto the box (from your PC)
scp -r healthy-futures-api ubuntu@3.234.119.82:~/

# 2. SSH in and set up
ssh ubuntu@3.234.119.82
cd ~/healthy-futures-api
npm install

# 3. Create your real .env (don't reuse tachyonleap-spirituallayer's JWT_SECRET)
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# paste that into .env as JWT_SECRET
# fill in DATABASE_URL with the healthyfutures password you set earlier
nano .env

# 4. Build, migrate, and do a one-off test run
npm run build
npm run migrate
npm start
# Ctrl+C once you see "healthy-futures-api listening on port 8090"
```

Sanity-check it's reachable locally on the box before touching nginx or pm2:

```bash
curl -s http://127.0.0.1:8090/health
# should print {"status":"ok","service":"healthy-futures-api"}
```

## Run it permanently with pm2

```bash
npm install -g pm2   # if not already installed
pm2 start dist/server.js --name healthy-futures-api
pm2 save
```

This keeps it running independently of the existing `tachyonleap` pm2
process and the `soccer-ai-api`/`tachyonleap-alexa-api` Docker containers —
nothing here touches those.

## Next steps (not yet built)

- Expose this publicly via nginx (a new subdomain, e.g.
  `healthyfutures-api.demo.gomllabs.com`, is cleaner than a path under the
  TachyonLeap domain since it's a genuinely different product)
- Wire the React Native app's auth screens to this service instead of mock
  data
- Check-in records, PrimeFit results, and nutrition logs (with real context
  — see the nutrition issue about needing timing/activity context) still
  need their own tables and endpoints here
