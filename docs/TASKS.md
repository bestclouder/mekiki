# Tasks — Mekiki

## Sprint 1 — DB + Ingestion Engine (core engine)
**Goal**: Data pipeline runs end-to-end; signals appear in DB from real API data.
- [ ] Create Supabase project; apply migration SQL (all tables + v1 RLS + seed rows)
- [ ] Build Edge Function: fetch CoinGecko top-100 → upsert `tokens` + `token_snapshots`
- [ ] Build Edge Function: fetch CryptoPanic → insert `news_items` with keyword tagging
- [ ] Implement rule-based signal detection → insert `signals` with score
- [ ] Wire Vercel Cron to trigger ingestion every 30 min
- [ ] Confirm signals rows in DB after first run (manual check)

**Definition of Done**: After a cron trigger, ≥5 `signals` rows exist with scores >0, sourced from live API data fetched within the last 30 min. Verified by querying Supabase dashboard.

---

## Sprint 2 — Digest Page (v1 functional) ✅ milestone
**Goal**: Anonymous visitor sees live Digest; app is demoable.
- [ ] Build `/` Next.js page: ranked signal cards (token, score, badge, summary)
- [ ] All five card states: loading skeleton, empty (no signals yet), partial (signal no summary), error (API fail banner), ready
- [ ] GPT-4o summary generation wired into ingestion job → stored in `signals.summary`
- [ ] Confidence badge shown on card ("AI · 91% confident")
- [ ] Manual refresh button (triggers re-fetch for demo)
- [ ] Seed data visible on first load before any cron run

**Definition of Done**: Visiting `/` without login shows ≥5 ranked token cards with signal badges and AI summaries. Loading/empty/error states render correctly. Confirmed in Vercel Preview.

---

## Sprint 3 — Stripe Checkout (paid tier)
**Goal**: Pro checkout works end-to-end; subscription recorded in DB.
- [ ] Create Stripe product + price (Pro monthly)
- [ ] `/api/checkout` route: creates Stripe Checkout session → returns URL
- [ ] Stripe webhook `/api/webhook`: verifies signature → upserts `subscriptions` row with `tier='pro'`
- [ ] Pro gate on signal detail expansion (full news snippets, raw evidence JSON)
- [ ] Success/cancel pages after checkout
- [ ] Webhook signature failure → 400, logged to `audit_logs`

**Definition of Done**: Complete Stripe test-mode checkout → `subscriptions` row with `tier='pro'` appears in DB. Pro detail panel visible. Cancel flow returns to Digest gracefully.

---

## Sprint 4 — Lock It Down (auth + per-user RLS)
**Goal**: Real users own their data; anonymous demo still works for public Digest.
- [ ] Enable Supabase Auth (email/password + magic link)
- [ ] Sign-up / login pages (minimal, post-purchase flow)
- [ ] Replace permissive RLS with owner policies on `subscriptions` (auth.uid() = user_id)
- [ ] Link subscription to auth user on login post-checkout
- [ ] Digest page remains public (signals/tokens read-open); only subscription detail gated
- [ ] Confirm no secrets leak in client bundle (network tab audit)

**Definition of Done**: Logged-in Pro user sees gated detail. Anonymous user sees Digest but not detail. RLS blocks cross-user subscription reads. Verified in Supabase RLS checker.

---

## Gantt (sprint → week)
| Sprint | Week |
|---|---|
| 1 — DB + Ingestion | 1 |
| 2 — Digest Page | 1–2 |
| 3 — Stripe Checkout | 2 |
| 4 — Lock It Down | 3 |