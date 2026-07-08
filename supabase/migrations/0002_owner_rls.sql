-- Sprint 4 — Lock it down: per-user owner RLS.
--
-- ⚠️ APPLY THIS ONLY AFTER setting SUPABASE_SERVICE_ROLE_KEY in the project env.
-- After this migration, clients (anon/authenticated) can no longer WRITE to
-- `subscriptions`; only the service-role key (used by the Stripe webhook /
-- confirm handlers via lib/supabase/admin.ts) can. Without the service-role
-- key set, Pro recording will fail. The public Digest is unaffected.
--
-- Public market data (tokens, token_snapshots, news_items, signals) stays
-- world-readable so the anonymous Digest keeps working. Only `subscriptions`
-- (user-owned, sensitive) gets owner policies, and `audit_logs` becomes
-- append-only.

-- ── subscriptions: owner read, service-role-only write ──────────────────────
drop policy if exists "subscriptions_v1_read" on subscriptions;
drop policy if exists "subscriptions_v1_write" on subscriptions;

-- Only the row owner may read their subscription (blocks cross-user reads).
create policy "subscriptions_owner_read" on subscriptions
  for select using (auth.uid() = user_id);

-- No insert/update/delete policy for anon or authenticated roles → all client
-- writes are denied. The service-role key bypasses RLS, so the server-side
-- webhook / confirm handlers remain the only writers.

-- ── audit_logs: append-only (insert + read, no update/delete) ────────────────
drop policy if exists "audit_logs_v1_read" on audit_logs;
drop policy if exists "audit_logs_v1_write" on audit_logs;

create policy "audit_logs_insert" on audit_logs
  for insert with check (true);
create policy "audit_logs_read" on audit_logs
  for select using (true);
-- deliberately no update/delete policy → logs cannot be mutated or removed.

-- tokens / token_snapshots / news_items / signals keep their v1 public-read +
-- permissive-write policies from 0001 (public market data, no per-user owner).
