-- =============================================================
-- UPnRise — RLS policies (Phase 1)
-- Paste into Supabase → SQL Editor → New query → Run.
--
-- These are defense in depth. The primary access control is in the
-- Next.js layouts (lib/auth/session.ts). RLS catches anything that
-- somehow bypasses the app layer, *if* the query comes through a
-- non-superuser connection (the Supabase JS client with anon key +
-- user JWT). Our Prisma client connects as `postgres.[ref]`, which
-- bypasses RLS — so for code paths where RLS must apply, use the
-- Supabase JS client, not Prisma.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ───────────── Helper: current user's role ─────────────
-- Reads role from the public.users row keyed on auth.uid().
-- security definer so the policy itself can read users without
-- being subject to its own RLS.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.users where id = auth.uid();
$$;

-- ───────────── Helper: current user's company_id ─────────────
create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid();
$$;

-- ───────────── Enable RLS on all tenant/auth tables ─────────────
alter table public.companies                enable row level security;
alter table public.users                    enable row level security;
alter table public.impersonation_sessions   enable row level security;
alter table public.audit_log                enable row level security;

-- Drop existing policies if re-running (idempotency)
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('companies','users','impersonation_sessions','audit_log')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ───────────── companies ─────────────
-- super_admin: see all tenants
-- everyone else: only their own company
create policy "companies: super_admin reads all"
  on public.companies for select
  to authenticated
  using ( current_user_role() = 'super_admin' );

create policy "companies: tenant members read own"
  on public.companies for select
  to authenticated
  using ( id = current_user_company_id() );

-- Writes: super_admin only (admins editing their own tenant come later)
create policy "companies: super_admin writes"
  on public.companies for all
  to authenticated
  using ( current_user_role() = 'super_admin' )
  with check ( current_user_role() = 'super_admin' );

-- ───────────── users ─────────────
-- super_admin: see all users
-- admin: see users in their tenant
-- trainee: see only self
create policy "users: super_admin reads all"
  on public.users for select
  to authenticated
  using ( current_user_role() = 'super_admin' );

create policy "users: admin reads tenant users"
  on public.users for select
  to authenticated
  using (
    current_user_role() = 'admin'
    and company_id = current_user_company_id()
  );

create policy "users: trainee reads self"
  on public.users for select
  to authenticated
  using ( id = auth.uid() );

-- Writes: super_admin (any) or admin (own tenant). Trainee writes
-- arrive in later phases via specific RPCs.
create policy "users: super_admin writes"
  on public.users for all
  to authenticated
  using ( current_user_role() = 'super_admin' )
  with check ( current_user_role() = 'super_admin' );

create policy "users: admin writes tenant"
  on public.users for all
  to authenticated
  using (
    current_user_role() = 'admin'
    and company_id = current_user_company_id()
  )
  with check (
    current_user_role() = 'admin'
    and company_id = current_user_company_id()
  );

-- ───────────── impersonation_sessions ─────────────
-- super_admin only; can read all (audit-quality) but only insert as themselves.
create policy "impersonation: super_admin reads all"
  on public.impersonation_sessions for select
  to authenticated
  using ( current_user_role() = 'super_admin' );

create policy "impersonation: super_admin starts own"
  on public.impersonation_sessions for insert
  to authenticated
  with check (
    current_user_role() = 'super_admin'
    and operator_id = auth.uid()
  );

create policy "impersonation: super_admin ends own"
  on public.impersonation_sessions for update
  to authenticated
  using (
    current_user_role() = 'super_admin'
    and operator_id = auth.uid()
  )
  with check (
    current_user_role() = 'super_admin'
    and operator_id = auth.uid()
  );

-- ───────────── audit_log ─────────────
-- super_admin: read all
-- admin: read entries for their tenant
-- inserts: all authenticated users can write their own entries (the app
-- enforces what's truthful — RLS just stops cross-actor forgery).
create policy "audit: super_admin reads all"
  on public.audit_log for select
  to authenticated
  using ( current_user_role() = 'super_admin' );

create policy "audit: admin reads tenant"
  on public.audit_log for select
  to authenticated
  using (
    current_user_role() = 'admin'
    and company_id = current_user_company_id()
  );

create policy "audit: actor writes own"
  on public.audit_log for insert
  to authenticated
  with check ( actor_id = auth.uid() );
