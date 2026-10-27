-- ============================================================
-- Migration 009 — one account per email address, whatever case it was typed in.
--
-- Apply after 008_email_verification.sql:
--   psql -U postgres -d run_league -f db/009_email_case_insensitive.sql
--   (or: npm run migrate)
--
-- Safe to run more than once.
--
-- WHY
-- `users.email` had a UNIQUE constraint, but it is case-sensitive, and nothing
-- normalised the address on the way in. Self-registration stored whatever was
-- typed and `findByEmail` compared with `=`. Two consequences, both measured:
--
--   1. Signing up as `Bob@uow.edu.au` made the account unreachable by
--      `bob@uow.edu.au` — login returned "Incorrect email or password". Phone
--      keyboards capitalise the first letter by default, so this was easy to
--      hit and impossible for the person to diagnose.
--   2. The duplicate check missed the second spelling, so the same person could
--      register twice. Verified: an account existed at `Bob.<n>@UOW.edu.au` and
--      registering `bob.<n>@uow.edu.au` returned 201 with a new user id.
--
-- The application now lowercases on the way in (InputPolicy.normalizeEmail) and
-- compares with LOWER() on the way out. This migration makes the database
-- enforce the same thing, so a future code path cannot reintroduce it, and adds
-- the functional index that keeps those lookups cheap.
--
-- WHAT THIS DOES NOT DO
-- It does not merge or delete accounts. If two rows already differ only by
-- case, each may have its own runs, group memberships and badges, and choosing
-- which to keep is not a decision a migration should make silently. It stops
-- with a message naming the addresses instead.
-- ============================================================

-- ------------------------------------------------------------
-- Refuse to proceed if existing rows already collide. Raising here gives a
-- message that says what to do; letting CREATE UNIQUE INDEX fail would give
-- "could not create unique index" and a constraint name.
-- ------------------------------------------------------------
DO $$
DECLARE
    collisions TEXT;
    collision_count INTEGER;
BEGIN
    SELECT COUNT(*), STRING_AGG(sample, ', ')
      INTO collision_count, collisions
      FROM (
        SELECT LOWER(email) || ' (' || STRING_AGG(user_id::text, ', ' ORDER BY user_id) || ')' AS sample
          FROM users
         GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
         LIMIT 20
      ) dupes;

    IF collision_count > 0 THEN
        RAISE EXCEPTION
            'Migration 009 cannot run: % email address(es) exist under more than one capitalisation. '
            'Each listed address has several user ids: %. '
            'Decide which account to keep for each, move any runs and memberships across, delete the other, '
            'then run this migration again. No data has been changed.',
            collision_count, collisions;
    END IF;
END $$;

-- ------------------------------------------------------------
-- Normalise what is already stored. Only rows that are not already lowercase
-- are touched, so re-running this is free.
-- ------------------------------------------------------------
UPDATE users
   SET email = LOWER(email),
       updated_at = NOW()
 WHERE email <> LOWER(email);

-- ------------------------------------------------------------
-- The guarantee, and the index that makes `WHERE LOWER(email) = LOWER($1)` an
-- index lookup rather than a scan. Both jobs from one index.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
    ON users (LOWER(email));

-- Pending verification rows are matched by LOWER(email) too (migration 008),
-- so the same lookup deserves the same index.
CREATE INDEX IF NOT EXISTS idx_email_verifications_email_lower
    ON email_verifications (LOWER(email));

ANALYZE users;
