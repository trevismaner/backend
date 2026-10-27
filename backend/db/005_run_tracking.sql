-- ============================================================
-- Migration 005 — run tracking: in-progress runs, and a guard against saving one twice.
--
-- Apply after 004_instructor_credentials.sql:
--   psql -U postgres -d run_league -f db/005_run_tracking.sql
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- A run that is still being recorded.
--
-- Before this, a run in progress existed only in the phone's memory: if the app was killed
-- mid-run, the whole run was lost. The app now checkpoints here while tracking, so it can
-- pick the run back up.
--
-- user_id is the primary key, so a user has at most one run in progress — starting a second
-- one is a conflict rather than silently abandoning the first.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_runs (
    user_id          INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    started_at       TIMESTAMP NOT NULL,
    distance_km      NUMERIC(6,2) NOT NULL DEFAULT 0,
    duration_seconds INTEGER      NOT NULL DEFAULT 0,
    route_gps        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- An idempotency key supplied by the app, unique per user.
--
-- The app generates one per run it is about to save and reuses it on retry, so a double tap
-- on Save — or a retry after a dropped connection — returns the run that was already stored
-- instead of recording it a second time and paying out the points twice.
--
-- NULL is allowed and not covered by the index: a caller that sends no key (an older build,
-- or a script) keeps the previous behaviour.
-- ------------------------------------------------------------
ALTER TABLE runs ADD COLUMN IF NOT EXISTS client_run_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_client_run_id
    ON runs (user_id, client_run_id)
    WHERE client_run_id IS NOT NULL;

-- Run history is always read newest-first for one user; this is the index for that.
CREATE INDEX IF NOT EXISTS idx_runs_user_started_at
    ON runs (user_id, started_at DESC);
