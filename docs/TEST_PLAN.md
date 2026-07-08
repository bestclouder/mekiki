# Test Plan — Mekiki

## Core Success Scenario
1. Open `/` in a fresh incognito window (no login)
2. **Expected**: Page loads within 5 s; ≥5 token cards visible with score badges
3. Each card shows: token symbol, signal type badge (volume/price/news), one-line AI summary, confidence %
4. Click "See details" on any card → Pro gate modal appears
5. Click "Upgrade to Pro" → Stripe Checkout opens in test mode
6. Complete checkout with card `4242 4242 4242 4242` → redirected to success page
7. **Expected**: `subscriptions` table in Supabase has a row with `tier='pro'` and correct email
8. Return to `/` → Pro detail panel now unlocked for that session

## Empty State
- Temporarily disable cron; clear `signals` table
- Visit `/` → card area shows "No signals yet — next scan in X min" message
- Re-enable cron; wait for run → cards populate without page refresh required

## Error State
- Set CoinGecko API key to invalid value
- Trigger manual refresh → error banner "Data fetch failed — showing last known results"
- Old seeded cards still visible (not a blank screen)
- `audit_logs` has a row with `status='error'` for that run

## Loading State
- Throttle network to Slow 3G in DevTools
- Visit `/` → skeleton card placeholders visible before data resolves

## Payment Failure
- Use Stripe test card `4000 0000 0000 0002` (decline)
- Checkout shows decline message; redirected to cancel page
- No `subscriptions` row created

## Webhook Security
- POST to `/api/webhook` with a tampered payload (wrong signature)
- **Expected**: 400 response; no DB write; error logged in `audit_logs`

## RLS Check (post Sprint 4)
- Query `subscriptions` from Supabase client with a different user's JWT
- **Expected**: 0 rows returned (owner policy blocks cross-user read)