-- 004: what an instructor actually submits for verification (SA-11, IU-04)
--
-- Until now `users.credentials_verified` was a bare boolean: an admin could mark an
-- instructor verified, but the instructor had no way to submit anything and the admin had
-- nothing to check. These columns hold what is being verified.
--
-- Safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_qualification VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_reference     VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_submitted_at  TIMESTAMP;

-- Lets the admin list "submitted, awaiting review" ahead of instructors who have sent nothing.
CREATE INDEX IF NOT EXISTS idx_users_credential_pending
  ON users (credential_submitted_at)
  WHERE credential_submitted_at IS NOT NULL;
