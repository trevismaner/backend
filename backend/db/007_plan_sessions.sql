-- ============================================================
-- Migration 007 — a fitness plan becomes an actual schedule.
--
-- Apply after 006_leaderboard_totals.sql:
--   npm run migrate      (or: psql -U postgres -d run_league -f db/007_plan_sessions.sql)
--
-- Safe to run more than once.
--
-- WHY
-- A plan held a goal and a weekly frequency and nothing else — "4 runs a week for 12 weeks".
-- There was nothing to follow on a Tuesday. These tables give a plan the weeks and the
-- individual sessions it was always implying, which also makes "what you planned against
-- what you ran" something the app can show rather than something the runner works out.
-- ============================================================

-- ------------------------------------------------------------
-- How a plan's schedule was produced, and whether it is ready yet.
--
-- Generation happens away from the request because it may call a language model, which takes
-- seconds. The screen polls `generation_status` rather than holding a request open.
--
--   none       no schedule has been asked for (every plan made before this migration)
--   generating in progress
--   ready      weeks and sessions are there to follow
--   failed     it did not work; generation_error says why, and the plan still works as it
--              did before — a goal and a frequency
-- ------------------------------------------------------------
ALTER TABLE fitness_plans ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE fitness_plans ADD COLUMN IF NOT EXISTS generated_by      VARCHAR(20);
ALTER TABLE fitness_plans ADD COLUMN IF NOT EXISTS generation_error  TEXT;
ALTER TABLE fitness_plans ADD COLUMN IF NOT EXISTS generated_at      TIMESTAMP;
ALTER TABLE fitness_plans ADD COLUMN IF NOT EXISTS coach_notes       TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'fitness_plans' AND constraint_name = 'fitness_plans_generation_status_check'
    ) THEN
        ALTER TABLE fitness_plans ADD CONSTRAINT fitness_plans_generation_status_check
            CHECK (generation_status IN ('none', 'generating', 'ready', 'failed'));
    END IF;
END $$;

-- `generated_by` records whether a schedule came from the language model or from the built-in
-- progressive-overload rules, so the app can say which — a generated plan should never be
-- passed off as something it is not.

-- ------------------------------------------------------------
-- One row per week of a plan.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_weeks (
    week_id            SERIAL PRIMARY KEY,
    plan_id            INTEGER NOT NULL REFERENCES fitness_plans(plan_id) ON DELETE CASCADE,
    week_number        INTEGER NOT NULL,
    focus              VARCHAR(120),
    target_distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
    notes              TEXT,
    UNIQUE (plan_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_plan_weeks_plan ON plan_weeks (plan_id, week_number);

-- ------------------------------------------------------------
-- One row per planned session.
--
-- day_of_week is 1 = Monday to 7 = Sunday, matching ISO weekdays and the Monday-start week
-- the dashboard already uses.
--
-- completed_run_id links a session to the run that fulfilled it. ON DELETE SET NULL so that
-- deleting a run un-ticks the session rather than deleting the plan's history along with it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_sessions (
    session_id       SERIAL PRIMARY KEY,
    week_id          INTEGER NOT NULL REFERENCES plan_weeks(week_id) ON DELETE CASCADE,
    day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    session_type     VARCHAR(30) NOT NULL
                     CHECK (session_type IN ('easy', 'long', 'tempo', 'intervals', 'recovery', 'cross_training', 'rest')),
    distance_km      NUMERIC(6,2),
    duration_minutes INTEGER,
    description      TEXT,
    completed_run_id INTEGER REFERENCES runs(run_id) ON DELETE SET NULL,
    completed_at     TIMESTAMP,
    UNIQUE (week_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_plan_sessions_week ON plan_sessions (week_id, day_of_week);

-- Finding the session a given run completed, when a run is deleted or corrected.
CREATE INDEX IF NOT EXISTS idx_plan_sessions_completed_run
    ON plan_sessions (completed_run_id) WHERE completed_run_id IS NOT NULL;
