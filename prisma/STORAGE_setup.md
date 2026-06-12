# Supabase Storage — one-time bucket setup

The Add-Training editors now persist uploads (thumbnails, documents,
SCORM zips, GIFs, videos, visual aids) to Supabase Storage instead of
inline base64 data URLs. Before any of those uploads work, the bucket
needs to exist + the service role key needs to be in `.env.local`.

## 1. Create the `attachment` bucket

Supabase dashboard → **Storage → New bucket**:

- **Name:** `attachment`
- **Public bucket:** ✅ yes (we serve files via the public URL — paths
  are namespaced by tenant + training so URL guessing is impractical)
- **File size limit:** Set to the largest cap we accept (1 GB for SCORM
  + videos). The dashboard caps at 50 MB by default — change to 1 GB
  under **Configuration** if you want video/SCORM uploads to succeed.
- **Allowed MIME types:** leave empty (we validate in the server
  action). Pre-filtering at the bucket level just gives confusing
  errors during development.

That's the whole bucket setup. No RLS policies needed — writes go via
the service role key, reads are public.

## 2. Add the service role key to `.env.local`

Supabase dashboard → **Settings → API**:

- Copy the **`service_role`** key (NOT the anon key — that one's
  already wired in via `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Add to `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ…the-long-jwt-from-the-dashboard…
```

The key NEVER goes to the browser. The `supabase-storage.ts` helper is
marked `import "server-only"` so any client-side import errors at
build time. If you accidentally expose it via `NEXT_PUBLIC_…`, rotate
it immediately from the dashboard.

## 3. Restart the dev server

```
npm run dev
```

Env vars only load at process start.

## Folder layout inside the bucket

Every file lives under a deterministic path so deletion is easy:

```
attachment/
├── thumbnails/{trainingId}/{name}-{rand}.png
├── documents/{trainingId}/{moduleId}/{name}-{rand}.pdf
├── scorm/{trainingId}/{moduleId}/{name}-{rand}.zip
├── videos/{trainingId}/{moduleId}/{name}-{rand}.mp4
├── visual-aids/{trainingId}/{moduleId}/{name}-{rand}.jpg
└── gifs/{trainingId}/{moduleId}/{name}-{rand}.gif
```

`{rand}` is a 12-char hex suffix so re-uploads don't collide.

## Why a public bucket

For the prototype: simplicity. Files are referenced by URL across the
admin + trainee surfaces, so signed URLs would mean every read had to
go through a server route. A public bucket with hard-to-guess paths
(UUIDs + random suffix) gives us the same practical privacy without
the per-read overhead.

When we go to production, the bucket flips to private + we add signed
URL generation in `supabase-storage.ts`. That's a ~30-line change
isolated to the storage helper — no edit surface needs to know.

## Migrating existing data-URL rows (optional)

Existing modules / trainings persist inline base64 data URLs in
`body.documents[].url`, `body.scorm.url`, `Training.thumbnailUrl`,
etc. These still render fine — the trainee Document / SCORM viewers
accept both data URLs and `https://` URLs.

If you want to move them into the bucket (smaller rows, faster page
loads), it's a one-off script: fetch each row, base64-decode the
data URL, push to Supabase Storage, swap the URL in place. Not in
scope right now — just adding the bucket means *new* uploads go to
Storage. Old rows stay valid.

## Troubleshooting

- **"SUPABASE_SERVICE_ROLE_KEY is not set"** — `.env.local` not loaded
  or key not added. Restart `npm run dev` after editing `.env.local`.
- **"storage upload failed: Bucket not found"** — Bucket name must be
  exactly `attachment`. Check Storage → Buckets.
- **"storage upload failed: Payload too large"** — bucket file-size
  cap is below the file's size. Raise it under Storage → Configuration.
- **"new row violates row-level security policy"** — RLS is on the
  bucket but the service role should bypass it. Check that the
  service_role key (not anon) is in `.env.local`. If you've added
  custom RLS, drop policies on the `storage.objects` table for this
  bucket: the service role bypasses RLS by default.
