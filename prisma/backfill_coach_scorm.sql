-- Step 2 of 2: backfill existing Coach + SCORM modules from
-- ModuleType.document (with body.kind marker) to first-class
-- ModuleType.coach / scorm.
--
-- PREREQUISITE: run prisma/add_coach_scorm_enum.sql first in a
-- separate Run, or you'll hit "55P04: unsafe use of new value
-- 'coach'" — Postgres rejects using an enum value in the same
-- transaction it was added in, and the Supabase editor wraps each
-- Run in one transaction.
--
-- Safe to re-run end-to-end: the WHERE clauses match zero rows on
-- subsequent runs.
-- We deliberately do NOT strip body.kind here so rollback stays a
-- one-statement UPDATE (see footer).

BEGIN;

-- Preview rows we're about to migrate.
SELECT id, name, type, body->>'kind' AS body_kind
FROM training_modules
WHERE type = 'document' AND body->>'kind' = 'coach';

UPDATE training_modules
SET type = 'coach'
WHERE type = 'document' AND body->>'kind' = 'coach';

SELECT id, name, type, body->>'kind' AS body_kind
FROM training_modules
WHERE type = 'document' AND body->>'kind' = 'scorm';

UPDATE training_modules
SET type = 'scorm'
WHERE type = 'document' AND body->>'kind' = 'scorm';

-- Sanity check — both unmigrated counts should be 0 after a successful run.
SELECT
  COUNT(*) FILTER (WHERE type = 'document' AND body->>'kind' = 'coach') AS unmigrated_coach,
  COUNT(*) FILTER (WHERE type = 'document' AND body->>'kind' = 'scorm') AS unmigrated_scorm,
  COUNT(*) FILTER (WHERE type = 'coach')                                AS coach_total,
  COUNT(*) FILTER (WHERE type = 'scorm')                                AS scorm_total
FROM training_modules;

COMMIT;

-- ─── Rollback ──────────────────────────────────────────────────────
-- Postgres can't drop an enum value, but rows can flip back to
-- 'document' (body.kind marker is still in place):
--
--   BEGIN;
--   UPDATE training_modules SET type = 'document'
--     WHERE type = 'coach' AND body->>'kind' = 'coach';
--   UPDATE training_modules SET type = 'document'
--     WHERE type = 'scorm' AND body->>'kind' = 'scorm';
--   COMMIT;
--
-- The two enum values stay defined but unused — harmless.
