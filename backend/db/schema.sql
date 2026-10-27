-- Run League Database Schema
-- Covers: Users, Runs, Fitness Plans, Risk Assessments, Groups, Tournaments,
-- Public Events, Instructor Board, Rewards/Badges, Notifications

-- =========================
-- USERS & AUTH
-- =========================

CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'registered_user'
                    CHECK (role IN ('registered_user', 'instructor', 'system_admin')),
    is_group_admin  BOOLEAN NOT NULL DEFAULT FALSE, -- promoted via RU-07 style flow
    is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
    profile_photo_url TEXT,
    bio             TEXT,
    push_token      TEXT,
    -- instructor-specific
    credentials_verified BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE user_notification_preferences (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    exercise_reminders   BOOLEAN NOT NULL DEFAULT TRUE,
    overtraining_alerts  BOOLEAN NOT NULL DEFAULT TRUE,
    tournament_updates   BOOLEAN NOT NULL DEFAULT TRUE,
    reward_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE connected_wearables (
    wearable_id     SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL CHECK (provider IN ('fitbit', 'garmin', 'samsung_health', 'apple_health')),
    access_token    TEXT NOT NULL,
    refresh_token   TEXT,
    connected_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);

CREATE TABLE connected_social_accounts (
    social_id       SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    platform        VARCHAR(20) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'x', 'strava', 'tiktok')),
    access_token    TEXT NOT NULL,
    connected_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, platform)
);

-- =========================
-- RUNS
-- =========================

CREATE TABLE runs (
    run_id          SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name            VARCHAR(100),
    description     TEXT,
    distance_km     NUMERIC(6,2),
    duration_seconds INTEGER,
    calories_burned INTEGER,
    avg_heart_rate  INTEGER,
    max_heart_rate  INTEGER,
    route_gps       JSONB, -- array of {lat, lng, timestamp}
    started_at      TIMESTAMP NOT NULL,
    ended_at        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================
-- FITNESS PLANS
-- =========================

CREATE TABLE fitness_plans (
    plan_id         SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    goal_type       VARCHAR(50), -- e.g. 'weight_loss', 'race_prep', 'general_fitness'
    target_distance_km NUMERIC(6,2),
    weekly_frequency INTEGER,
    duration_weeks  INTEGER,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================
-- RISK ASSESSMENT (AI)
-- =========================

CREATE TABLE risk_assessment_forms (
    form_id         SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_currently_sick BOOLEAN DEFAULT FALSE,
    chronic_conditions TEXT[], -- e.g. {'asthma'}
    past_injuries   JSONB,     -- array of {type, date, resolved}
    self_rated_soreness INTEGER CHECK (self_rated_soreness BETWEEN 1 AND 10),
    submitted_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE risk_scores (
    score_id        SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    ml_base_score   NUMERIC(5,2) NOT NULL,       -- XGBoost output, 0-100
    weather_modifier NUMERIC(5,2) DEFAULT 0,
    biometric_modifier NUMERIC(5,2) DEFAULT 0,
    health_condition_modifier NUMERIC(5,2) DEFAULT 0,
    final_score     NUMERIC(5,2) NOT NULL,
    risk_level      VARCHAR(20) CHECK (risk_level IN ('low', 'moderate', 'high')),
    contributing_factors JSONB, -- feature importance breakdown for explanation
    recommendation  TEXT,
    calculated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================
-- GROUPS
-- =========================

CREATE TABLE groups (
    group_id        SERIAL PRIMARY KEY,
    name            VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT,
    is_private      BOOLEAN NOT NULL DEFAULT FALSE,
    max_members     INTEGER,
    created_by      INTEGER NOT NULL REFERENCES users(user_id),
    is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
    group_id        INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE, -- this user promoted as group admin for this group
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'pending', 'invited')),
    joined_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- =========================
-- TOURNAMENTS (private, run within a group)
-- =========================

CREATE TABLE tournaments (
    tournament_id   SERIAL PRIMARY KEY,
    group_id        INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    created_by      INTEGER NOT NULL REFERENCES users(user_id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    distance_type   VARCHAR(50), -- e.g. '5K', '10K', 'Half Marathon'
    max_participants INTEGER,
    registration_deadline TIMESTAMP,
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'completed')),
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE tournament_participants (
    tournament_id   INTEGER NOT NULL REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    result_time_seconds INTEGER,
    rank            INTEGER,
    withdrawn       BOOLEAN NOT NULL DEFAULT FALSE,
    registered_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tournament_id, user_id)
);

-- =========================
-- PUBLIC EVENTS (platform-wide, run by System Admin / moderator role)
-- =========================

CREATE TABLE public_events (
    event_id        SERIAL PRIMARY KEY,
    created_by      INTEGER NOT NULL REFERENCES users(user_id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    max_participants INTEGER,
    registration_deadline TIMESTAMP,
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE public_event_participants (
    event_id        INTEGER NOT NULL REFERENCES public_events(event_id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    result_time_seconds INTEGER,
    rank            INTEGER,
    withdrawn       BOOLEAN NOT NULL DEFAULT FALSE,
    registered_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

-- =========================
-- INSTRUCTOR BOARD
-- =========================

CREATE TABLE instructor_posts (
    post_id         SERIAL PRIMARY KEY,
    author_id       INTEGER NOT NULL REFERENCES users(user_id),
    title           VARCHAR(200),
    content         TEXT NOT NULL,
    category        VARCHAR(50), -- e.g. 'nutrition', 'training'
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================
-- REWARDS & BADGES
-- =========================

CREATE TABLE rewards (
    reward_id       SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    points_required INTEGER NOT NULL,
    reward_type     VARCHAR(20) CHECK (reward_type IN ('voucher', 'membership', 'badge')),
    stock           INTEGER, -- NULL = unlimited
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_points (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    total_points    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_claimed_rewards (
    claim_id        SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reward_id       INTEGER NOT NULL REFERENCES rewards(reward_id),
    claimed_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE badges (
    badge_id        SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    icon_url        TEXT
);

CREATE TABLE user_badges (
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    badge_id        INTEGER NOT NULL REFERENCES badges(badge_id),
    earned_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    is_displayed    BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, badge_id)
);

-- =========================
-- NOTIFICATIONS
-- =========================

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL, -- 'exercise_reminder', 'overtraining_alert', 'tournament_update', 'new_badge'
    title           VARCHAR(200),
    body            TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================
-- INDEXES
-- =========================

CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_started_at ON runs(started_at);
CREATE INDEX idx_risk_scores_user_id ON risk_scores(user_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_tournament_participants_user_id ON tournament_participants(user_id);
CREATE INDEX idx_notifications_user_id_unread ON notifications(user_id) WHERE is_read = FALSE;

-- =========================
-- REFERENCE DATA (rewards and badges catalog)
-- =========================

INSERT INTO rewards (name, description, points_required, reward_type, stock) VALUES
('$10 Sportswear Voucher', 'Redeemable at participating sportswear stores', 500, 'voucher', NULL),
('$25 Sportswear Voucher', 'Redeemable at participating sportswear stores', 1200, 'voucher', NULL),
('1-Month Gym Membership', 'One month access to a partner gym', 2000, 'membership', 50),
('Run League Cap', 'Limited edition cap', 300, 'voucher', 100);

INSERT INTO badges (name, description, icon_url) VALUES
('First Steps', 'Completed your first run', NULL),
('Consistent Runner', 'Completed 10 runs', NULL),
('Marathoner', 'Accumulated 100km total distance', NULL),
('Team Player', 'Joined your first group', NULL),
('Competitor', 'Joined your first tournament', NULL);
