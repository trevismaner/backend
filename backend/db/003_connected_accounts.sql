-- 003: what OAuth connections actually need (RU-16 wearables, RU-49 social)
--
-- The original tables stored an access token and nothing else. A real OAuth connection
-- also has an expiry (so it can be refreshed before it dies), the scopes that were granted
-- (so the app knows what it may ask for), and the account's id at the provider.
--
-- Safe to re-run.

ALTER TABLE connected_wearables ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMP;
ALTER TABLE connected_wearables ADD COLUMN IF NOT EXISTS scope            TEXT;
ALTER TABLE connected_wearables ADD COLUMN IF NOT EXISTS provider_user_id VARCHAR(128);
ALTER TABLE connected_wearables ADD COLUMN IF NOT EXISTS last_synced_at   TIMESTAMP;
ALTER TABLE connected_wearables ADD COLUMN IF NOT EXISTS last_sync_error  TEXT;

ALTER TABLE connected_social_accounts ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMP;
ALTER TABLE connected_social_accounts ADD COLUMN IF NOT EXISTS scope            TEXT;
ALTER TABLE connected_social_accounts ADD COLUMN IF NOT EXISTS provider_user_id VARCHAR(128);

-- Imported activities carry their id at the provider, so syncing twice cannot create
-- duplicate runs. NULL for runs the user logged themselves.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS source      VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_external
  ON runs (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- Short-lived state values for the OAuth handshake. A `state` parameter ties the callback
-- back to the user who started it and is what stops an attacker grafting their own
-- connection onto someone else's account (CSRF).
CREATE TABLE IF NOT EXISTS oauth_states (
    state       VARCHAR(64) PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider    VARCHAR(20) NOT NULL,
    kind        VARCHAR(10) NOT NULL CHECK (kind IN ('wearable', 'social')),
    redirect_to TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states (created_at);
