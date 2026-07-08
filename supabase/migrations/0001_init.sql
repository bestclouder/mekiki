create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  symbol text not null,
  name text not null,
  coingecko_id text unique not null,
  is_tracked boolean not null default true,
  created_at timestamptz not null default now()
);

alter table tokens enable row level security;
drop policy if exists "tokens_v1_read" on tokens;
create policy "tokens_v1_read" on tokens for select using (true);
drop policy if exists "tokens_v1_write" on tokens;
create policy "tokens_v1_write" on tokens for all using (true) with check (true);

create table if not exists token_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  token_id uuid references tokens(id),
  fetched_at timestamptz not null default now(),
  price_usd numeric,
  volume_24h numeric,
  price_change_24h_pct numeric,
  market_cap numeric,
  created_at timestamptz not null default now()
);

alter table token_snapshots enable row level security;
drop policy if exists "token_snapshots_v1_read" on token_snapshots;
create policy "token_snapshots_v1_read" on token_snapshots for select using (true);
drop policy if exists "token_snapshots_v1_write" on token_snapshots;
create policy "token_snapshots_v1_write" on token_snapshots for all using (true) with check (true);

create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  token_id uuid references tokens(id),
  headline text not null,
  url text,
  source text,
  published_at timestamptz,
  keywords text[],
  created_at timestamptz not null default now()
);

alter table news_items enable row level security;
drop policy if exists "news_items_v1_read" on news_items;
create policy "news_items_v1_read" on news_items for select using (true);
drop policy if exists "news_items_v1_write" on news_items;
create policy "news_items_v1_write" on news_items for all using (true) with check (true);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  token_id uuid references tokens(id),
  signal_type text not null,
  severity text not null default 'medium',
  score numeric not null default 0,
  summary text,
  summary_source text,
  summary_confidence numeric,
  summary_review_status text default 'unreviewed',
  triggered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table signals enable row level security;
drop policy if exists "signals_v1_read" on signals;
create policy "signals_v1_read" on signals for select using (true);
drop policy if exists "signals_v1_write" on signals;
create policy "signals_v1_write" on signals for all using (true) with check (true);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  stripe_customer_id text,
  stripe_session_id text,
  tier text not null default 'free',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table subscriptions enable row level security;
drop policy if exists "subscriptions_v1_read" on subscriptions;
create policy "subscriptions_v1_read" on subscriptions for select using (true);
drop policy if exists "subscriptions_v1_write" on subscriptions;
create policy "subscriptions_v1_write" on subscriptions for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  tool_used text,
  input_hash text,
  output_summary text,
  triggered_by text,
  risk_level text,
  status text,
  created_at timestamptz not null default now()
);

alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

insert into tokens (symbol, name, coingecko_id, is_tracked) values
  ('BTC', 'Bitcoin', 'bitcoin', true),
  ('SOL', 'Solana', 'solana', true),
  ('WIF', 'dogwifhat', 'dogwifhat', true),
  ('ARB', 'Arbitrum', 'arbitrum', true),
  ('JUP', 'Jupiter', 'jupiter-exchange-solana', true)
on conflict (coingecko_id) do nothing;

insert into token_snapshots (token_id, fetched_at, price_usd, volume_24h, price_change_24h_pct, market_cap)
select id, now(), 67400.00, 38000000000, 3.2, 1320000000000 from tokens where symbol = 'BTC'
union all
select id, now(), 172.50, 4200000000, 11.4, 79000000000 from tokens where symbol = 'SOL'
union all
select id, now(), 2.87, 980000000, 22.7, 2870000000 from tokens where symbol = 'WIF'
union all
select id, now(), 1.12, 310000000, -4.1, 1450000000 from tokens where symbol = 'ARB'
union all
select id, now(), 0.98, 195000000, 7.8, 1280000000 from tokens where symbol = 'JUP';

insert into news_items (token_id, headline, url, source, published_at, keywords)
select id, 'Solana DEX volume hits all-time high as ecosystem activity surges', 'https://example.com/sol-dex-ath', 'CryptoPanic', now() - interval '3 hours', array['volume','dex','all-time-high'] from tokens where symbol = 'SOL'
union all
select id, 'dogwifhat (WIF) airdrop rumours fuel 20% price spike', 'https://example.com/wif-airdrop', 'CryptoPanic', now() - interval '5 hours', array['airdrop','price-spike'] from tokens where symbol = 'WIF'
union all
select id, 'Jupiter Exchange announces major partnership with TradFi firm', 'https://example.com/jup-partnership', 'CryptoPanic', now() - interval '7 hours', array['partnership','listing'] from tokens where symbol = 'JUP';

insert into signals (token_id, signal_type, severity, score, summary, summary_source, summary_confidence, summary_review_status, triggered_at)
select id, 'volume_spike', 'high', 88, 'SOL trading volume is 3.8× its 7-day average, coinciding with a DEX all-time-high record and broad ecosystem momentum.', 'openai/gpt-4o', 0.93, 'unreviewed', now() from tokens where symbol = 'SOL'
union all
select id, 'price_move', 'high', 82, 'WIF surged 22.7% in 24 h on heavy volume following unconfirmed airdrop rumours circulating on social media.', 'openai/gpt-4o', 0.87, 'unreviewed', now() from tokens where symbol = 'WIF'
union all
select id, 'news_event', 'medium', 71, 'JUP is up 7.8% after announcing a TradFi partnership, signalling growing real-world adoption for the Jupiter aggregator.', 'openai/gpt-4o', 0.89, 'unreviewed', now() from tokens where symbol = 'JUP'
union all
select id, 'price_move', 'medium', 65, 'SOL price moved 11.4% alongside volume, reinforcing a high-conviction bullish signal for the near term.', 'openai/gpt-4o', 0.85, 'unreviewed', now() from tokens where symbol = 'SOL'
union all
select id, 'volume_spike', 'low', 45, 'BTC volume is elevated at $38B over 24 h but within normal range for a period of moderate upward price drift.', 'openai/gpt-4o', 0.78, 'unreviewed', now() from tokens where symbol = 'BTC';