-- 008_email_verification.sql
--
-- Real email verification for sign-up.
--
-- The thing that shapes this table: in the app's sign-up flow the email is verified BEFORE
-- the account exists. The order is email -> verify -> choose password -> accept terms ->
-- create account, so there is no user row to hang a `verified` column off at the point
-- verification happens. Codes are therefore keyed by email address, not by user id.
--
-- The code itself is never stored. Only a SHA-256 hash of it goes in, so a leaked database
-- does not let anyone complete a half-finished sign-up. (SHA-256 rather than bcrypt here
-- because these are six random digits with a ten-minute life, checked on every attempt —
-- the slow-hash argument that applies to passwords does not apply, and bcrypt would make
-- the attempt limit the only thing standing between us and a slow endpoint.)
--
-- `attempts` is what stops someone trying all million six-digit codes: the row is spent
-- after a handful of wrong guesses and a fresh code has to be requested.

CREATE TABLE IF NOT EXISTS email_verifications (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  code_hash     CHAR(64)     NOT NULL,          -- sha256 hex of the 6-digit code
  expires_at    TIMESTAMP    NOT NULL,
  attempts      INTEGER      NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMP,                      -- set when the correct code is accepted
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Lookups are always "the live code for this email", so index the lowered address.
CREATE INDEX IF NOT EXISTS idx_email_verifications_email
  ON email_verifications (LOWER(email));

-- Used to rate-limit requests per address: "how many have I issued recently".
CREATE INDEX IF NOT EXISTS idx_email_verifications_created
  ON email_verifications (LOWER(email), created_at DESC);

-- Once an account exists we keep the fact that its address was confirmed, so the flag
-- survives the verification rows being cleaned up.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Existing accounts predate verification. Marking them NULL (not verified) would lock out
-- every seeded and already-registered user the moment the feature is switched on, so they
-- are grandfathered in as verified at the time this migration runs.
UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL;
