# Data Model — Mekiki

## tokens
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | owner scope (unused v1) |
| symbol | text | e.g. BTC |
| name | text | e.g. Bitcoin |
| coingecko_id | text unique | API key |
| is_tracked | bool default true | |
| created_at | timestamptz | |

## token_snapshots
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| token_id | uuid FK tokens | |
| fetched_at | timestamptz | |
| price_usd | numeric | |
| volume_24h | numeric | |
| price_change_24h_pct | numeric | |
| market_cap | numeric | |
| created_at | timestamptz | |

## news_items
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| token_id | uuid FK tokens nullable | |
| headline | text | |
| url | text | |
| source | text | |
| published_at | timestamptz | |
| keywords | text[] | matched keywords |
| created_at | timestamptz | |

## signals
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| token_id | uuid FK tokens | |
| signal_type | text | volume_spike / price_move / news_event |
| severity | text | low/medium/high |
| score | numeric | composite 0–100 |
| summary | text | **AI field** |
| summary_source | text | openai/gpt-4o |
| summary_confidence | numeric | 0–1 |
| summary_review_status | text default 'unreviewed' | |
| triggered_at | timestamptz | |
| created_at | timestamptz | |

## subscriptions
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | linked after auth |
| email | text | |
| stripe_customer_id | text | |
| stripe_session_id | text | |
| tier | text default 'free' | free/pro |
| status | text default 'active' | |
| created_at | timestamptz | |

## RLS
All tables: RLS enabled. v1 permissive read+write policies for anonymous demo. Lock-down sprint replaces with `auth.uid() = user_id`.