# PRD — Mekiki

## Problem
Crypto traders waste time checking multiple sites to spot what's moving. There's no single page that surfaces abnormal volume, price swings, and relevant news (hacks, airdrops, real-world use) in one glance.

## Target User
Individual crypto traders who want a daily digest of the most interesting tokens — starting with the builder themselves.

## Core Objects
- **Token** — a tracked crypto asset (symbol, name, market data)
- **Signal** — a flagged event on a token (volume spike, price move, news item)
- **Digest** — the ranked daily highlight reel (top N signals per 24 h window)
- **Subscription** — paid tier record (free vs pro access)

## MVP Checklist (v1 must-haves)
- [ ] Fetch + store 24 h token market data (volume, price change) from a public API
- [ ] Detect and store signals: volume spike >2×avg, price move >10%, notable news keyword match
- [ ] Display ranked Digest page — top tokens with signal badges and one-line summaries
- [ ] Anonymous visitors can view the Digest (no login wall)
- [ ] Stripe Checkout for Pro tier (unlock full signal detail + news snippets)
- [ ] Data refreshes on a scheduled job (at least every 30 min)

## Non-Goals (v1)
- Portfolio / watchlist per user
- Push notifications or alerts
- Ad serving / view tracking
- Mobile app
- Historical backtesting

## Success Criteria
At 09:00 on any weekday, an anonymous visitor opens Mekiki and within 5 seconds sees a ranked list of ≥5 tokens with at least one signal each (volume, price, or news), a one-line AI summary, and a confidence score — all sourced from live market data fetched in the last 30 minutes. A Pro checkout completes end-to-end and the tier is recorded in the database.