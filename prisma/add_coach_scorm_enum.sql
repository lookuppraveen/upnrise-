-- Step 1 of 2: add `coach` and `scorm` to the ModuleType enum.
--
-- Run this on its own first (paste into Supabase SQL editor, hit Run).
-- Then run backfill_coach_scorm.sql to migrate existing rows.
--
-- Why two files: Postgres won't let a freshly added enum value be
-- used in the same transaction it was added in, and the Supabase
-- editor wraps each Run as a single transaction. Separating the
-- ALTER from the UPDATE side-steps that.
--
-- Safe to re-run: IF NOT EXISTS makes both ALTERs no-ops once the
-- values exist.

ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'coach';
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'scorm';

-- Verify the enum now has all 8 values:
--   SELECT unnest(enum_range(NULL::"ModuleType"));
-- Expected: video, roleplay, quiz, document, gamified, evaluation,
--           coach, scorm
