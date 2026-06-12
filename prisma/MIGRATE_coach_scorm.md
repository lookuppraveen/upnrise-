# Promote `coach` and `scorm` to first-class `ModuleType` enum values

Today Coach and SCORM modules are stored as `ModuleType.document` with a
`body.kind` marker (`"coach"` or `"scorm"`). That works end-to-end but
costs us:

- Module counts and analytics roll Coach/SCORM into Document.
- Several editors + the trainee router branch by `body.kind` instead of
  `m.type`.
- Two server actions (`createCoachModule`, `createScormModule`) write
  `type: "document"` plus a body marker — easy to drift.

This migration promotes both to real enum values and is reversible until
code starts depending on the new values.

## Order of operations

The SQL is split into two files because Postgres won't let a freshly
added enum value be used in the same transaction that added it — and
the Supabase SQL editor wraps each Run as one transaction. So you
have to do the ALTER and the UPDATE as two separate Runs.

**Path A — SQL first** (recommended; one fewer dev-server stop):

1. Open the Supabase SQL editor. Paste
   [`prisma/add_coach_scorm_enum.sql`](./add_coach_scorm_enum.sql),
   hit Run. (Two `ALTER TYPE` statements.)
2. Clear the editor. Paste
   [`prisma/backfill_coach_scorm.sql`](./backfill_coach_scorm.sql),
   hit Run. (Backfills existing rows.)
3. **Stop the dev server** (Windows DLL lock on the Prisma engine).
4. **Apply the schema diff** below to `prisma/schema.prisma`.
5. **`npx prisma generate`** — refreshes the client so TS picks up the
   new enum values. (Skip `db push` — Postgres already has them.)
6. **Apply the code changes** in the checklist below.
7. Restart the dev server. Verify per the checklist at the bottom.

*From a terminal instead of the Supabase editor:* `psql` runs each
statement in its own implicit transaction, so you can `psql … -f
add_coach_scorm_enum.sql && psql … -f backfill_coach_scorm.sql` in one
shot.

**Path B — Prisma first**:

1. Stop the dev server.
2. Apply the schema diff to `prisma/schema.prisma`.
3. `npx prisma db push` (adds the enum values via Prisma).
4. Run `prisma/backfill_coach_scorm.sql` — the ALTERs in
   `add_coach_scorm_enum.sql` aren't needed but re-running them is a
   no-op via `IF NOT EXISTS`.
5. `npx prisma generate`.
6. Apply the code changes; restart the dev server.

## Schema diff

`prisma/schema.prisma` — extend the `ModuleType` enum:

```diff
 enum ModuleType {
   video
   roleplay
   quiz
   document
   // Phase H additions: surfaces a "Gamified Activity" learner experience
   // (gamified) and a dedicated open-ended Evaluation module (evaluation).
   // Their body editors land in Phase M.
   gamified
   evaluation
+  // Phase 2 promotions: Coach + SCORM, previously stored as
+  // document with body.kind markers. See prisma/MIGRATE_coach_scorm.md.
+  coach
+  scorm
 }
```

That's the only schema change. Postgres adds enum values without a table
rewrite, so `db push` is fast and non-locking on Supabase.

## Code changes after the migration

The changes are small (~20 lines across 8 files) but they all need to
land together — otherwise the build fails for ~30 seconds while either
the maps are short an entry or `body.kind` checks reference values that
no longer exist on real Coach/SCORM rows.

### 1. Server actions — `src/app/admin/trainings/actions.ts`

Three updates:

- `ModuleTypeSchema` (line ~152) — extend the `z.enum` to include
  `"coach"` and `"scorm"`.
- `createCoachModule` (line ~244) — change `type: "document"` to
  `type: "coach"` and drop the `kind: "coach"` line from body (keep
  `coachConfig`).
- `saveCoachModule` (line ~828) — change the `findFirst`'s `type:
  "document"` filter to `type: "coach"`, and drop the `if (current.kind
  !== "coach")` guard + the `kind: "coach"` line from `nextBody`.
- `createScormModule` (line ~324) — change `type: "document"` to
  `type: "scorm"` and drop `body: { kind: "scorm" }` (leave `body:
  undefined` so it stays null on first save).
- `saveScormModule` (line ~964) — same fixes as `saveCoachModule` but
  for `"scorm"`.
- `defaultModuleName` (line ~556) — add `case "coach"` and `case
  "scorm"` arms returning "New coach module" / "New SCORM module".

### 2. AI route — `src/app/api/admin/create-coach/generate/route.ts`

Line 66: `type: "document"` → `type: "coach"`. Drop `kind: "coach"`
from the body literal — keep everything else (coachConfig +
generationPrompt).

### 3. AddModuleMenu — `src/components/admin/wizard/AddModuleMenu.tsx`

Two cleanups:

- Drop the `kind: "coach"` / `kind: "scorm"` fields from the `MenuItem`
  union and the `ITEMS` literals. The `key` (`ModuleType`) is now the
  full discriminator.
- In the `pick()` switch, replace the special-cased branches:
  - `if (item.key === "coach")` block still routes to
    `/modules/new/coach` (intermediate page — keep it).
  - The `if (item.key === "scorm")` block can drop the direct
    `createScormModule()` call and instead hit the standard
    `addModule(trainingId, "scorm")` path that all other live types use.

### 4. ModuleEditPage — `src/components/admin/ModuleEditPage.tsx`

Replace the `body.kind` discrimination inside the `m.type === "document"`
branch with two new top-level branches:

```ts
if (m.type === "coach") {
  return (<div className="max-w-[1100px] mx-auto px-6 py-8">
    <CoachModuleEditor … />
  </div>);
}
if (m.type === "scorm") {
  return (<div className="max-w-[1100px] mx-auto px-6 py-8">
    <ScormModuleEditor … />
  </div>);
}
if (m.type === "document") {
  return (<div className="max-w-[1100px] mx-auto px-6 py-8">
    <DocumentModuleEditor … />
  </div>);
}
```

…and remove the body.kind branching inside the document block. The
exhaustive `never` check at the bottom keeps the TS compiler honest.

### 5. StepModules — `src/components/admin/wizard/StepModules.tsx`

Add entries to `MODULE_ICON`, `MODULE_ACCENT`, `MODULE_TYPE_LABEL`:

```ts
coach: "trophy",         scorm: "layers",
coach: "#d4a017",        scorm: "#14b8a6",
coach: "Coach",          scorm: "SCORM",
```

Then delete the `moduleDisplay()` helper that reads `body.kind` — the
maps are now the single source of truth. The two callsites (icon block
+ label chip) revert to `MODULE_ICON[m.type]` / `MODULE_TYPE_LABEL[m.type]`.

### 6. Trainee — `src/app/learn/trainings/[id]/page.tsx`

Same treatment as StepModules: add `coach`/`scorm` entries to the
`MODULE_ICON` and `MODULE_LABEL` maps and delete the
`moduleDisplayMeta()` helper.

### 7. Trainee — `src/app/learn/trainings/[id]/modules/[mid]/page.tsx`

Drop the `bodyKind` variable and replace the `mod.type === "document" &&
bodyKind === "scorm"` / `coach` branches with plain `mod.type === "scorm"`
/ `coach` branches. Also add `coach: "trophy"` and `scorm: "layers"` to
`ICON_BY_TYPE` and the corresponding entries to `LABEL_BY_TYPE`.

### 8. Optional cleanup — strip `body.kind`

Once the migration has been verified in production for a release cycle,
you can run:

```sql
UPDATE training_modules
SET body = body - 'kind'
WHERE type IN ('coach', 'scorm') AND body ? 'kind';
```

…to remove the now-redundant marker. Until then, leaving `body.kind`
in place means rollback is one SQL statement (see footer of
`backfill_coach_scorm.sql`).

## Verification checklist

After the migration + code changes:

- [ ] Build passes: `npx tsc --noEmit`
- [ ] Step 2 grid: existing Coach modules show as **Coach** (trophy /
      gold), existing SCORM modules show as **SCORM** (layers / teal).
- [ ] Click + Add New Module → Coach → Create Manually → lands on the
      Coach editor (not Document).
- [ ] Click + Add New Module → Scorm → lands on the SCORM editor.
- [ ] Trainee view (`/learn/trainings/[id]`) shows the same labels.
- [ ] `SELECT type, COUNT(*) FROM training_modules GROUP BY type;` shows
      coach + scorm rows and no orphaned document rows with
      `body.kind`.

## Why we're doing this in two passes

Right now (today) the body.kind approach works perfectly — the only
"smell" is data-shape, not behavior. So:

- **The migration is non-urgent.** Ship Sprint 3 (storage + AI) first if
  the storage limitation is what's blocking real users.
- **The migration is mechanical.** No design decisions, no schema
  redesign — just a rename + a fan-out of a discriminator. Worth doing
  in a clean focused commit when convenient.
