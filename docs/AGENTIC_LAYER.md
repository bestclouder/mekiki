# Agentic Layer — Mekiki

## Risk Levels & Actions

### Low — Auto-execute (no approval needed)
- **summarise_signal**: generate one-line GPT summary for a signal → writes `signals.summary`
- **score_token**: compute composite score from snapshot data → writes `signals.score`
- **tag_news**: match keywords in headline → writes `news_items.keywords`

### Medium — Light approval (builder confirms before run)
- **refresh_token_list**: add new tokens to tracking from trending API → inserts `tokens` rows
- **re-score_digest**: recalculate today's Digest rankings mid-day

### High — Always approval
- **create_subscription**: record Pro tier after Stripe webhook confirms payment
- **send_email_digest**: push summary email to subscriber list (post-v1)

### Critical — Human only
- Refund / cancel subscription
- Delete token data
- Any Stripe API write beyond webhook receipt

## Named Tools (approved list)
- `coingecko_fetch` — GET market data
- `cryptopanic_fetch` — GET news feed
- `openai_complete` — POST chat completion (server-side only)
- `stripe_create_checkout` — POST checkout session
- `supabase_upsert` — DB write via service-role key (server only)

## Audit Log Fields
`action | tool_used | input_hash | output_summary | triggered_by | risk_level | status | created_at`

## v1 vs Later
- **v1**: Low-risk auto actions run in cron job; Stripe webhook handled server-side
- **Later**: Builder dashboard to approve medium-risk actions; email send tool