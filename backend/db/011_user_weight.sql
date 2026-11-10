-- 011: body weight on the user profile, so calories burned can be estimated.
--
-- Energy cost of running is close to 1.03 kcal per kilogram per kilometre and, unlike
-- walking, barely varies with pace. Distance the app already measures; weight is the one
-- missing input, and without it no calorie figure can be produced at all.
--
-- Nullable on purpose. Nobody is required to give a weight, and a run logged without one
-- stores no calorie figure rather than a figure derived from a guessed body mass.
--
-- The range is a typing check, not a medical judgement: it catches a weight entered in
-- pounds or mistyped by a digit, both of which would otherwise produce a calorie number
-- that looks authoritative and is wrong by a factor of two.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_weight_kg_check;

ALTER TABLE users
    ADD CONSTRAINT users_weight_kg_check
    CHECK (weight_kg IS NULL OR (weight_kg >= 20 AND weight_kg <= 400));
