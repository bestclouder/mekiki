# Security Audit & Hardening — Mekiki

Living record of security findings, their status, and the controls in place.
Last reviewed: **2026-07-09** (external LLM audit + in-repo verification).

## TL;DR

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | `audit_logs` world-readable via public anon key | High | **Code fixed; needs migration `0003` applied** |
| 2 | `subscriptions` readable/writable via public anon key | High | **Needs migration `0003` applied** |
| 3 | Public market tables (`tokens`/`token_snapshots`/`news_items`/`signals`) anon-**writable** | High | **Needs migration `0003` applied** |
| 4 | Raw customer email written into `audit_logs.output_summary` | Medium | ✅ **Fixed in code** ([lib/pii.ts](../lib/pii.ts)) |
| 5 | No CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy | Medium | ✅ **Fixed** ([next.config.ts](../next.config.ts)) |
| — | Server secrets (Stripe secret, service-role, webhook secret, CoinGecko key) in client bundle | — | ✅ Confirmed **not** leaking |

Root cause of 1–3: the lockdown migration was committed but **never applied**, so
the permissive bootstrap policy from `0001_init.sql` — `for all using (true) with
check (true)` on every table — is what's live in production.

## Findings in detail

### 1–3. Row Level Security is wide open (HIGH)

The Supabase **anon key is public by design** (it ships in the `/login` page
bundle, along with the project URL — this is normal and expected). Mekiki's
entire data-security model therefore rests on **Row Level Security (RLS)**.

Because `supabase/migrations/0002_owner_rls.sql` was never applied, the
`0001` bootstrap policies remain live. Verified read-only from outside using
only the public anon key on 2026-07-09:

- `GET /rest/v1/audit_logs` → **HTTP 200**, rows returned (world-readable).
- `GET /rest/v1/subscriptions` → **HTTP 200** (empty only because no one has
  subscribed yet).

The same `for all using(true) with check(true)` policy also permits **anonymous
INSERT/UPDATE/DELETE** on every table. This was **not** demonstrated against
production (we do not mutate live data during an audit), but it follows directly
from the unapplied migration.

**Impact once a real user subscribes:** their Stripe session id and (previously)
email would be readable by anyone with the public anon key. Anyone could also
forge/delete `subscriptions` rows or tamper with the `signals`/`tokens` data the
homepage renders.

**Fix:** apply [`0003_full_lockdown.sql`](../supabase/migrations/0003_full_lockdown.sql)
(the single definitive lockdown; supersedes `0002`):

- `tokens` / `token_snapshots` / `news_items` / `signals`: **public read, no
  write policy** → anon can read (public digest) but not write; the ingestion
  cron writes with the service-role key, which bypasses RLS.
- `subscriptions`: **owner-read only** (`auth.uid() = user_id`), no client write.
- `audit_logs`: **no anon policy at all** → not readable or writable by the
  public; the server reads/writes it with the service-role key.

> **Precondition — do this first:** set `SUPABASE_SERVICE_ROLE_KEY` in the Vercel
> env (Server-only, all environments). All server writes go through
> [lib/supabase/admin.ts](../lib/supabase/admin.ts), which prefers the
> service-role key. **If you apply `0003` without setting that key, the scanner
> and checkout recording will stop writing** (they'd fall back to the now
> write-blocked anon key).

### 4. Raw email in audit logs (MEDIUM) — ✅ fixed

`lib/subscription.ts` previously wrote
`output_summary = "tier=pro email=<address> session=<id>"`. Even after `audit_logs`
is locked, storing raw PII is poor hygiene. Now it writes a non-reversible
fingerprint via [`emailTag()`](../lib/pii.ts): `email#<12-hex SHA-256>` — stable
enough to correlate a user's events, useless for recovering the address.

### 5. Missing security headers (MEDIUM) — ✅ fixed

[next.config.ts](../next.config.ts) now sends on every route:

- **Content-Security-Policy** — `default-src 'self'`; tight `connect-src` (only
  self + the Supabase origin, because every market-data API is proxied
  server-side); `frame-ancestors 'none'`; `object-src 'none'`;
  `upgrade-insecure-requests`.
- **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**,
  **Referrer-Policy: strict-origin-when-cross-origin**, **Permissions-Policy**
  disabling camera/mic/geo/topics.
- HSTS is already provided by Vercel.

**Known limitation:** `script-src`/`style-src` include `'unsafe-inline'` because
Next.js App Router emits an inline hydration bootstrap and the UI uses React
inline styles. The app renders **no user-supplied HTML** (summaries are plain
text escaped by React), so the residual XSS surface is low. Next hardening step:
a nonce-based CSP via middleware.

### Not leaking: server secrets — ✅ confirmed

Grep of the deployed client bundles (`.next/static`) finds none of:
`service_role`, `sk_live_`/`sk_test_…`, `whsec_`, `OPENAI_API_KEY`,
`STRIPE_SECRET`, or the CoinGecko key. Only the anon key and (would-be) Stripe
**publishable** key reach the browser — both public by design.

## Action checklist

**Owner (requires credentials Claude does not hold):**

- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel env (Server-only).
- [ ] Apply `supabase/migrations/0003_full_lockdown.sql` to the Supabase project
      (SQL editor or `supabase db push`).
- [ ] Re-run the verification below and confirm `audit_logs` / `subscriptions`
      return **401/empty** to the anon key.

**Done in code (shipped):**

- [x] Stop writing raw email to `audit_logs` (`lib/pii.ts`, `lib/subscription.ts`).
- [x] Security headers (`next.config.ts`).
- [x] "Last scanned" time sourced from public `token_snapshots`, not `audit_logs`,
      so locking `audit_logs` doesn't break the homepage.
- [x] `0003_full_lockdown.sql` authored (read-only anon on market data, owner-only
      subscriptions, private audit_logs).

## Verify RLS after applying 0003

With the public anon key (found in the `/login` bundle), from outside:

```bash
URL=https://<project>.supabase.co
KEY=<anon key>
# EXPECT: [] or 401 — no rows leak
curl -s "$URL/rest/v1/audit_logs?select=*&limit=1"  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/subscriptions?select=*&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# EXPECT: an anonymous write is rejected (401/403), not "201 Created"
curl -s -X POST "$URL/rest/v1/signals" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"signal_type":"x","token_id":null}'
# EXPECT: still readable (public digest)
curl -s "$URL/rest/v1/signals?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

## Ongoing rules

- **Never** put a server secret in `NEXT_PUBLIC_*` or client components.
- **Never** write raw PII into `audit_logs` — use `emailTag()`.
- All DB **writes** go server-side through `lib/supabase/admin.ts` (service role).
  The browser only ever **reads** public data + the signed-in user's own rows.
- Any new table starts with RLS enabled and an explicit, least-privilege policy —
  never `using (true)` for writes.
