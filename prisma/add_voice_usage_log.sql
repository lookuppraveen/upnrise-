-- Create the voice_usage_log table for Phase 4 cost tracking + caps.
--
-- Paste into Supabase SQL Editor (or `psql` for local), hit Run.
-- Safe to re-run: IF NOT EXISTS guards on the table + indexes.
--
-- What this backs:
--   • /api/roleplay/tts writes one row per persona utterance
--   • /api/roleplay/stt writes one row per learner utterance
--   • Per-session soft cap sums chars_in scoped by session_id
--   • Per-tenant monthly cap sums chars_in scoped by company_id + created_at
--   • Super-admin dashboard tile aggregates cost_cents by company + month
--
-- After running this, restart the app (or your Vercel deploy) so the
-- Prisma client picks up the new model.

CREATE TABLE IF NOT EXISTS "voice_usage_log" (
    "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id"  uuid          NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "user_id"     uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "session_id"  uuid          REFERENCES "roleplay_sessions"("id") ON DELETE SET NULL,
    "kind"        text          NOT NULL,                     -- "tts" | "stt" | "tts_preview"
    "provider"    text          NOT NULL DEFAULT 'elevenlabs',
    "model"       text,
    "voice_id"    text,
    "chars_in"    integer,
    "bytes_in"    integer,
    "cost_cents"  integer       NOT NULL DEFAULT 0,
    "meta"        jsonb,
    "created_at"  timestamptz   NOT NULL DEFAULT now()
);

-- Hot query: per-tenant monthly spend for the super-admin tile.
CREATE INDEX IF NOT EXISTS "voice_usage_log_company_id_created_at_idx"
    ON "voice_usage_log" ("company_id", "created_at");

-- Hot query: per-session cumulative usage for the soft cap check.
CREATE INDEX IF NOT EXISTS "voice_usage_log_session_id_idx"
    ON "voice_usage_log" ("session_id");

-- Verify:
--   SELECT count(*) FROM voice_usage_log;   -- expect 0 on a fresh table
--   \d voice_usage_log                       -- (psql) confirms columns + FKs
