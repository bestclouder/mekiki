-- Sprint 4b — FULL RLS lockdown (supersedes 0002_owner_rls.sql).
--
-- ⚠️ PRECONDITION: set SUPABASE_SERVICE_ROLE_KEY in the Vercel env BEFORE
-- applying this. After it, anonymous clients can only READ public market data;
-- every WRITE (ingestion cron, Stripe webhook/confirm) must go through the
-- service-role key, which bypasses RLS. Apply this without the key set and the
-- scanner + checkout recording will stop writing.
--
-- This migration is idempotent and is the single definitive lockdown — if you
-- apply it you do NOT also need 0002.
--
-- Fixes the audit findings:
--   • audit_logs was world-readable via the public anon key  → no anon policy
--   • subscriptions was world-readable/writable              → owner-read only
--   • tokens/snapshots/news/signals were anon-WRITABLE        → read-only
--   • (raw email in audit_logs.output_summary is fixed in app code, lib/pii.ts)

-- ── public market data: READ-only for anon, writes only via service role ────
do $$
declare t text;
begin
  foreach t in array array['tokens','token_snapshots','news_items','signals']
  loop
    execute format('alter table %I enable row level security', t);
    -- drop the permissive v1 policies (read + "for all" write)
    execute format('drop policy if exists %I on %I', t || '_v1_read', t);
    execute format('drop policy if exists %I on %I', t || '_v1_write', t);
    execute format('drop policy if exists %I on %I', t || '_public_read', t);
    -- world-readable (public digest), but NO write policy → anon cannot write;
    -- the service-role key bypasses RLS for the ingestion cron.
    execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
  end loop;
end $$;

-- ── subscriptions: owner-read only, service-role-only write ─────────────────
alter table subscriptions enable row level security;
drop policy if exists "subscriptions_v1_read" on subscriptions;
drop policy if exists "subscriptions_v1_write" on subscriptions;
drop policy if exists "subscriptions_owner_read" on subscriptions;
create policy "subscriptions_owner_read" on subscriptions
  for select using (auth.uid() = user_id);
-- no insert/update/delete policy → clients cannot write; webhook/confirm write
-- with the service-role key (bypasses RLS).

-- ── audit_logs: fully private (append-only via service role) ─────────────────
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
drop policy if exists "audit_logs_v1_write" on audit_logs;
drop policy if exists "audit_logs_insert" on audit_logs;
drop policy if exists "audit_logs_read" on audit_logs;
-- NO policies for anon/authenticated → not readable or writable by the public.
-- The service-role key bypasses RLS, so server-side logging still works and the
-- "last scanned" time on the homepage now comes from token_snapshots instead.
