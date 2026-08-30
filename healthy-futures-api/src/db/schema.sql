-- Healthy Futures database schema.
-- This database is fully separate from TachyonLeap's `tachyonleap` database —
-- no shared tables, no foreign keys across databases, no shared credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('coach', 'student')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  org_name    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_student_links (
  coach_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, student_id),
  -- A student can only be affiliated with one coach at a time.
  UNIQUE (student_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_student_links_coach ON coach_student_links(coach_id);

-- Direct messages between users (and the AI assistant).
CREATE TABLE IF NOT EXISTS direct_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email  TEXT NOT NULL,
  receiver_email TEXT NOT NULL,
  content       TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(
  LEAST(sender_email, receiver_email),
  GREATEST(sender_email, receiver_email),
  created_at DESC
);

-- Training sessions, owned by the coach who created them. There is no seeded
-- schedule: a new coach starts with an empty list and adds their own.
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  location   TEXT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_coach ON sessions(coach_id, starts_at DESC);

-- Attendance. Recorded by the coach only; a student cannot mark themselves
-- present. session_id is nullable so attendance logged before sessions existed
-- is preserved rather than dropped.
CREATE TABLE IF NOT EXISTS checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  session_label TEXT NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkins(session_id);

-- One attendance row per student per session, so tapping Present twice can't
-- inflate a student's attendance percentage.
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_unique_session
  ON checkins(user_id, session_id) WHERE session_id IS NOT NULL;

-- At-home fitness and healthy-habit log, one row per student per calendar day.
-- Columns mirror the program's printed routine: 4 fitness items, 4 habits.
-- log_date is a DATE (not a timestamp) so "today" is one row you can upsert.
CREATE TABLE IF NOT EXISTS routine_logs (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  active_play    BOOLEAN NOT NULL DEFAULT false,
  ball_control   BOOLEAN NOT NULL DEFAULT false,
  touches        BOOLEAN NOT NULL DEFAULT false,
  stretch        BOOLEAN NOT NULL DEFAULT false,
  fruits_veggies BOOLEAN NOT NULL DEFAULT false,
  water          BOOLEAN NOT NULL DEFAULT false,
  breakfast      BOOLEAN NOT NULL DEFAULT false,
  sleep          BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_routine_logs_user_date
  ON routine_logs(user_id, log_date DESC);

-- Coach's assessment of the level-up criteria, one row per student per month.
-- Attendance is deliberately absent: it is derived from `checkins` so it can't
-- drift from the attendance the app already reports.
CREATE TABLE IF NOT EXISTS criteria_ratings (
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period      DATE NOT NULL,
  rated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  attitude    BOOLEAN NOT NULL DEFAULT false,
  effort      BOOLEAN NOT NULL DEFAULT false,
  coachability BOOLEAN NOT NULL DEFAULT false,
  skill       BOOLEAN NOT NULL DEFAULT false,
  character   BOOLEAN NOT NULL DEFAULT false,
  academics   BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period)
);

CREATE INDEX IF NOT EXISTS idx_criteria_student_period
  ON criteria_ratings(student_id, period DESC);

-- PrimeFit quiz results. Kept as history so progress over time is visible.
CREATE TABLE IF NOT EXISTS primefit_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source         TEXT NOT NULL,
  score          INTEGER NOT NULL,
  strongest_area TEXT,
  weakest_area   TEXT,
  recommendation TEXT,
  summary        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_primefit_user
  ON primefit_results(user_id, created_at DESC);

-- ZenFit wellness check-ins: a short mood/energy log plus the assistant's reply.
CREATE TABLE IF NOT EXISTS zenfit_checkins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood       TEXT NOT NULL,
  energy     INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  note       TEXT,
  reply      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zenfit_user
  ON zenfit_checkins(user_id, created_at DESC);

-- One row per companion use, so a coach can see what a student has been doing
-- without reaching into each companion's own table. `score` is normalized to
-- 0-100 where the companion produces one; `detail` is a short human summary.
CREATE TABLE IF NOT EXISTS companion_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion  TEXT NOT NULL CHECK (companion IN ('nutrition', 'primefit', 'zenfit', 'soccer')),
  score      INTEGER,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companion_activity_user
  ON companion_activity(user_id, created_at DESC);

-- Face enrolment for soccer-clip identification. This is biometric data about a
-- minor, so: consent is recorded explicitly, the row is deletable on request,
-- and only the embedding is kept for matching (no photo is stored server-side).
CREATE TABLE IF NOT EXISTS face_enrollments (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  embedding     REAL[] NOT NULL,
  consent_by    TEXT NOT NULL,
  consent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-student soccer results, so a coach's attribution persists and shows up in
-- the student's own history.
CREATE TABLE IF NOT EXISTS soccer_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_ref   TEXT NOT NULL,
  effort        INTEGER NOT NULL,
  distance_m    REAL,
  top_speed_ms  REAL,
  sprints       INTEGER,
  rank_in_clip  INTEGER,
  players_in_clip INTEGER,
  identified_by TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soccer_results_user
  ON soccer_results(user_id, created_at DESC);

-- Expo push tokens, one row per device. A user may have several (phone + tablet),
-- and a token can migrate between users on a shared device, so the token is the
-- primary key rather than the user.
CREATE TABLE IF NOT EXISTS push_tokens (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- Every nudge actually sent. This is what enforces the daily cap, the spacing
-- rule, and "send each nudge kind at most once per day" - so it must be written
-- even if the push itself fails downstream.
CREATE TABLE IF NOT EXISTS nudge_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  screen      TEXT,
  params      JSONB,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nudge_log_user_sent
  ON nudge_log(user_id, sent_at DESC);

-- Per-student nudge preferences. Absent row means defaults apply.
CREATE TABLE IF NOT EXISTS nudge_prefs (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  quiet_start SMALLINT NOT NULL DEFAULT 21,
  quiet_end   SMALLINT NOT NULL DEFAULT 7,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Practice clips a student records at home and sends to their coach. The file
-- itself lives on disk under VIDEO_STORAGE_DIR; only the relative filename is
-- stored, so the storage root can move without a migration. These are videos of
-- minors, so playback is always auth-gated and never a public URL.
CREATE TABLE IF NOT EXISTS practice_videos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  caption      TEXT,
  byte_size    BIGINT NOT NULL,
  mime_type    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_practice_videos_user
  ON practice_videos(user_id, created_at DESC);

-- Single-use password reset tokens. Only a SHA-256 hash is stored, so a database
-- leak can't be used to reset anyone's password. Rows are deleted on use and
-- swept once expired.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Per-student details captured once at signup so the companions don't ask for
-- them every session. `age` is derived from the verified date of birth rather
-- than typed in, so it can't be inflated to bypass the 13+ age gate.
CREATE TABLE IF NOT EXISTS user_profile (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age                INTEGER,
  allergies          TEXT,
  is_athlete         BOOLEAN,
  dietary_preference TEXT,
  full_name          TEXT,
  phone              TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance status. A row still means "the coach recorded something", but
-- 'excused' is removed from the attendance percentage entirely rather than
-- counting against the student — a doctor's note shouldn't cost them a level-up.
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'present';
ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_status_check;
ALTER TABLE checkins ADD CONSTRAINT checkins_status_check
  CHECK (status IN ('present', 'excused'));

-- Character Points. Kids are reluctant to talk about how they feel, so ZenFit
-- check-ins earn points and the character criterion ticks itself once a threshold
-- is passed. `character_override` lets a coach force the tick on or off
-- regardless of points: NULL means "follow the points".
ALTER TABLE criteria_ratings
  ADD COLUMN IF NOT EXISTS character_override BOOLEAN;

-- Coach overrides for the auto-scored criteria. NULL means "follow the score";
-- true/false forces the tick regardless of what the score says.
ALTER TABLE criteria_ratings
  ADD COLUMN IF NOT EXISTS effort_override BOOLEAN,
  ADD COLUMN IF NOT EXISTS skill_override BOOLEAN;

-- Measured values behind two of the routine booleans. HealthKit can supply
-- exercise minutes and sleep hours; the booleans stay authoritative so Android
-- users and anyone without a watch keep working exactly as before.
ALTER TABLE routine_logs
  ADD COLUMN IF NOT EXISTS active_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS sleep_hours    REAL,
  -- 'health' when read from a device, 'manual' when the student tapped it.
  ADD COLUMN IF NOT EXISTS active_source  TEXT,
  ADD COLUMN IF NOT EXISTS sleep_source   TEXT;

-- When the day's exercise actually happened. A daily total cannot tell whether a
-- session was warmed up for; the timestamp of the longest bout can.
ALTER TABLE routine_logs
  ADD COLUMN IF NOT EXISTS exercise_at TIMESTAMPTZ;
