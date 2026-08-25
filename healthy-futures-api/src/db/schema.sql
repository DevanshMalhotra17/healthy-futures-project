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

-- Attendance check-ins for sessions.
CREATE TABLE IF NOT EXISTS checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_label TEXT NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, checked_in_at DESC);
