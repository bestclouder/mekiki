# Architecture — Mekiki

## Stack
- **Frontend**: Next.js 14 (App Router) on Vercel
- **Database**: Supabase (Postgres + RLS)
- **Background jobs**: Vercel Cron (every 30 min) → Edge Function
- **Market data**: CoinGecko public API (v3)
- **News**: CryptoPanic API (free tier)
- **AI summaries**: OpenAI GPT-4o (server-side only)
- **Payments**: Stripe Checkout + Webhooks

## Build Sequence
**Now (v1):** DB schema → ingestion job → signal detection → Digest page (anonymous) → Stripe checkout
**Next:** Per-user watchlists, email digests, richer news NLP
**Later:** Agentic trade alerts, portfolio tracking, ad tier

## Key User Action — Viewing the Digest
1. Cron fires → Edge Function calls CoinGecko + CryptoPanic
2. Raw market data written to `token_snapshots`; news written to `news_items`
3. Signal detection logic runs: compares current volume/price to 7-day rolling average; news keywords matched
4. New `signals` rows inserted; existing tokens upserted
5. Digest query ranks tokens by composite score (volume spike × price move × news flag)
6. Next.js page reads ranked signals via Supabase; renders Digest cards
7. Anonymous visitor sees digest; Pro gate shown on detail expansion
8. Visitor clicks Pay → Stripe Checkout → webhook sets `subscription.tier = 'pro'`

## Why Core Runs Without AI
Signal detection (volume spike, price threshold, keyword match) is pure rule-based SQL/JS. The AI summary is a display enhancement — if OpenAI is down, the card still renders with raw numbers and the signal badge.