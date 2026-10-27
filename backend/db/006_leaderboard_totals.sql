-- ============================================================
-- Migration 006 — running totals per user, so the leaderboard stops
-- aggregating every run in the database on every request.
--
-- Apply after 005_run_tracking.sql:
--   psql -U postgres -d run_league -f db/006_leaderboard_totals.sql
--   (or: npm run migrate)
--
-- Safe to run more than once.
--
-- WHY
-- The global leaderboard summed every row in `runs` for every user, then kept
-- the top 50. Measured on 20 000 users and 1.2M runs that was 583 ms of
-- database time per request, with two sequential scans. It did not only make
-- the leaderboard slow: the query held a pooled connection for its whole
-- duration, so unrelated requests queued behind it and run history went from
-- 65 ms to 1 806 ms at the 95th percentile while the leaderboard was in use.
--
-- HOW
-- A one-row-per-user table holding the two figures the leaderboard orders by,
-- kept current by triggers on `runs`. Triggers rather than application code
-- because every write path then stays correct automatically — the API, the
-- seed script, an admin deleting a run, and anything run by hand in psql.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_run_totals (
    user_id           INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    total_distance_km NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_runs        INTEGER       NOT NULL DEFAULT 0,
    updated_at        TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- The leaderboard's ORDER BY, so the top N is a short index walk.
CREATE INDEX IF NOT EXISTS idx_user_run_totals_distance
    ON user_run_totals (total_distance_km DESC, user_id);

-- ------------------------------------------------------------
-- Maintenance trigger.
--
-- GREATEST(0, ...) on the subtracting paths: the totals must never go
-- negative, even if a row were somehow removed twice. The figures are a
-- derived cache — `runs` remains the source of truth, and the backfill below
-- can rebuild them from it at any time.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION runs_maintain_user_totals() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO user_run_totals (user_id, total_distance_km, total_runs)
        VALUES (NEW.user_id, COALESCE(NEW.distance_km, 0), 1)
        ON CONFLICT (user_id) DO UPDATE
            SET total_distance_km = user_run_totals.total_distance_km + COALESCE(NEW.distance_km, 0),
                total_runs        = user_run_totals.total_runs + 1,
                updated_at        = NOW();
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE user_run_totals
           SET total_distance_km = GREATEST(0, total_distance_km - COALESCE(OLD.distance_km, 0)),
               total_runs        = GREATEST(0, total_runs - 1),
               updated_at        = NOW()
         WHERE user_id = OLD.user_id;
        RETURN OLD;

    ELSE -- UPDATE: a corrected distance has to move the total with it
        IF (NEW.user_id = OLD.user_id) THEN
            UPDATE user_run_totals
               SET total_distance_km = GREATEST(0, total_distance_km
                                                 - COALESCE(OLD.distance_km, 0)
                                                 + COALESCE(NEW.distance_km, 0)),
                   updated_at        = NOW()
             WHERE user_id = NEW.user_id;
        ELSE
            -- A run moving between users does not happen today, but the trigger
            -- stays correct if it ever does.
            UPDATE user_run_totals
               SET total_distance_km = GREATEST(0, total_distance_km - COALESCE(OLD.distance_km, 0)),
                   total_runs        = GREATEST(0, total_runs - 1),
                   updated_at        = NOW()
             WHERE user_id = OLD.user_id;

            INSERT INTO user_run_totals (user_id, total_distance_km, total_runs)
            VALUES (NEW.user_id, COALESCE(NEW.distance_km, 0), 1)
            ON CONFLICT (user_id) DO UPDATE
                SET total_distance_km = user_run_totals.total_distance_km + COALESCE(NEW.distance_km, 0),
                    total_runs        = user_run_totals.total_runs + 1,
                    updated_at        = NOW();
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_runs_user_totals ON runs;
CREATE TRIGGER trg_runs_user_totals
    AFTER INSERT OR UPDATE OR DELETE ON runs
    FOR EACH ROW EXECUTE FUNCTION runs_maintain_user_totals();

-- ------------------------------------------------------------
-- Backfill from the runs already stored. Rewritten rather than added to, so
-- this is also the repair if the totals are ever suspected of drifting.
-- ------------------------------------------------------------
INSERT INTO user_run_totals (user_id, total_distance_km, total_runs, updated_at)
SELECT r.user_id,
       COALESCE(SUM(r.distance_km), 0),
       COUNT(*)::int,
       NOW()
FROM runs r
GROUP BY r.user_id
ON CONFLICT (user_id) DO UPDATE
    SET total_distance_km = EXCLUDED.total_distance_km,
        total_runs        = EXCLUDED.total_runs,
        updated_at        = NOW();

ANALYZE user_run_totals;
