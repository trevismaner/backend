-- 010: the wearable providers the app actually offers.
--
-- Two changes, both to the same CHECK constraint.
--
-- google_health is added. The OAuth handshake for it was wired up before the constraint knew
-- the name, so a user could have approved access at Google and then watched the callback fail
-- on insert — the worst kind of bug, because everything up to the last step looks fine.
--
-- samsung_health and apple_health are removed. Samsung's activity endpoints need a signed
-- developer agreement this project does not hold, and Apple HealthKit is an on-device
-- framework that no web OAuth flow can satisfy. Both were listed as "declared but not
-- connectable", which is honest but still puts two dead entries on the connections screen.
--
-- Any rows for the two removed providers are deleted first: PostgreSQL validates a new CHECK
-- against existing rows, so the ALTER would fail while even one such row remained. In practice
-- there are none, because neither provider could ever complete a connection.

BEGIN;

DELETE FROM connected_wearables WHERE provider IN ('samsung_health', 'apple_health');

-- IF EXISTS because the constraint name depends on how the table was created: a column-level
-- CHECK gets the default <table>_<column>_check, but a database built from an older dump may
-- carry a different name. Dropping nothing is fine; the ADD below is what matters.
ALTER TABLE connected_wearables
    DROP CONSTRAINT IF EXISTS connected_wearables_provider_check;

ALTER TABLE connected_wearables
    ADD CONSTRAINT connected_wearables_provider_check
    CHECK (provider IN ('fitbit', 'garmin', 'google_health'));

COMMIT;
