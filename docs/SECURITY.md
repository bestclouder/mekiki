# Security — Mekiki

## Secret Handling
- All API keys (CoinGecko, CryptoPanic, OpenAI, Stripe secret, Supabase service-role) stored as Vercel environment variables — **never in client bundle**
- Supabase `anon` key only used client-side (read-only public data under permissive v1 RLS)
- Stripe webhook verified with `stripe.webhooks.constructEvent` (signature check) before any DB write
- OpenAI called only from Edge Functions / API routes — never from browser

## Permission Model
- **v1 (demo)**: All tables open read+write for anonymous users via permissive RLS policies
- **Lock-down sprint**: Replace with `auth.uid() = user_id` owner policies; only the row owner can write
- Subscriptions table: writes only via server-side Stripe webhook handler (service-role key); client never writes to `subscriptions` directly

## Approved Tools Rule
Agent functions may only call the five named tools in `AGENTIC_LAYER.md`. No dynamic `eval`, no arbitrary HTTP fetch from client, no `run_any` pattern.

## Audit Principle
Every ingestion run, signal creation, summary generation, and subscription change writes a row to `audit_logs`. Logs are append-only (no delete policy). If a run fails, the error is logged before any retry.