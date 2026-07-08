import { createAdminClient } from "@/lib/supabase/admin";
import { generateSummary } from "@/lib/summary";

/**
 * Mekiki ingestion engine — the core verb of the app.
 *
 * 1. Fetch live market data from CoinGecko (public API, no key required)
 * 2. Upsert `tokens` + insert `token_snapshots`
 * 3. Fetch news from CryptoPanic (if CRYPTOPANIC_API_KEY set) + keyword tag
 * 4. Rule-based signal detection & scoring against the 7-day rolling average
 * 5. Generate a one-line summary per signal (GPT-4o if OPENAI_API_KEY, else rule-based)
 * 6. Write `signals`; log the run to `audit_logs`
 *
 * Runs entirely server-side. Works with the AI switched off — summaries and
 * live news degrade gracefully; scoring is pure rule-based SQL/JS.
 */

const NEWS_KEYWORDS = [
  "hack",
  "exploit",
  "airdrop",
  "listing",
  "partnership",
  "launch",
  "upgrade",
  "sec",
  "etf",
  "delist",
];

// Tokens to ensure are tracked even before any cron run (used to widen coverage).
type CoinGeckoMarket = {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
};

export type IngestResult = {
  ok: boolean;
  tokens_upserted: number;
  snapshots_inserted: number;
  news_inserted: number;
  signals_inserted: number;
  ai: "openai" | "rule-based";
  errors: string[];
};

type Db = ReturnType<typeof createAdminClient>;

async function logAudit(
  db: Db,
  fields: {
    action: string;
    tool_used?: string;
    output_summary?: string;
    status: string;
    risk_level?: string;
  },
) {
  try {
    await db.from("audit_logs").insert({
      triggered_by: "ingestion",
      risk_level: "low",
      ...fields,
    });
  } catch {
    // Never let audit logging crash the run.
  }
}

/**
 * Fetch live market data: the CoinGecko top-100 by market cap (per
 * docs/TASKS.md Sprint 1), plus any explicitly tracked ids not in the top-100.
 */
async function fetchMarkets(extraIds: string[]): Promise<CoinGeckoMarket[]> {
  const top = await fetchMarketsPage({ perPage: 100 });
  const have = new Set(top.map((m) => m.id));
  const missing = extraIds.filter((id) => !have.has(id));
  if (missing.length === 0) return top;
  const extras = await fetchMarketsPage({ ids: missing });
  return [...top, ...extras];
}

async function fetchMarketsPage(opts: {
  ids?: string[];
  perPage?: number;
}): Promise<CoinGeckoMarket[]> {
  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  if (opts.ids) url.searchParams.set("ids", opts.ids.join(","));
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(opts.perPage ?? 250));
  url.searchParams.set("price_change_percentage", "24h");
  if (process.env.COINGECKO_API_KEY) {
    url.searchParams.set("x_cg_demo_api_key", process.env.COINGECKO_API_KEY);
  }

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`CoinGecko ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as CoinGeckoMarket[];
}

/** Fetch news from CryptoPanic (optional — needs CRYPTOPANIC_API_KEY). */
async function fetchNews(): Promise<
  { headline: string; url: string; source: string; published_at: string }[]
> {
  const token = process.env.CRYPTOPANIC_API_KEY;
  if (!token) return [];
  const url = new URL("https://cryptopanic.com/api/v1/posts/");
  url.searchParams.set("auth_token", token);
  url.searchParams.set("kind", "news");
  url.searchParams.set("public", "true");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CryptoPanic ${res.status}`);
  const data = (await res.json()) as {
    results?: {
      title: string;
      url: string;
      source?: { title?: string };
      published_at: string;
    }[];
  };
  return (data.results ?? []).map((r) => ({
    headline: r.title,
    url: r.url,
    source: r.source?.title ?? "CryptoPanic",
    published_at: r.published_at,
  }));
}

function matchKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return NEWS_KEYWORDS.filter((k) => lower.includes(k));
}

type ScoredSignal = {
  token_id: string;
  signal_type: "volume_spike" | "price_move" | "news_event";
  severity: "low" | "medium" | "high";
  score: number;
  evidence: Record<string, unknown>;
};

function severityFor(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/**
 * Rule-based scoring per docs/INTELLIGENCE_LAYER.md.
 * Produces one signal per triggered type; adds a +10 bonus when a token has
 * more than one signal type.
 */
function detectSignals(input: {
  tokenId: string;
  symbol: string;
  volume24h: number | null;
  avgVolume7d: number | null;
  priceChangePct: number | null;
  news: { keywords: string[] }[];
}): ScoredSignal[] {
  const signals: ScoredSignal[] = [];
  const { tokenId, volume24h, avgVolume7d, priceChangePct, news } = input;

  // Volume spike — needs history to compute a ratio.
  if (volume24h && avgVolume7d && avgVolume7d > 0) {
    const ratio = volume24h / avgVolume7d;
    if (ratio >= 2) {
      let score = 30;
      if (ratio >= 4) score += 20;
      score += Math.round(Math.min(ratio, 10) * 3);
      score = Math.min(100, score);
      signals.push({
        token_id: tokenId,
        signal_type: "volume_spike",
        severity: severityFor(score),
        score,
        evidence: { volume_ratio: Number(ratio.toFixed(2)), volume_24h: volume24h },
      });
    }
  }

  // Price move — works immediately from the 24h change.
  if (priceChangePct != null && Math.abs(priceChangePct) >= 10) {
    let score = 20;
    if (Math.abs(priceChangePct) >= 25) score += 15;
    score += Math.round(Math.min(Math.abs(priceChangePct), 50));
    score = Math.min(100, score);
    signals.push({
      token_id: tokenId,
      signal_type: "price_move",
      severity: severityFor(score),
      score,
      evidence: { price_change_pct: Number(priceChangePct.toFixed(2)) },
    });
  }

  // News event — any tagged news for this token.
  const matched = news.flatMap((n) => n.keywords);
  if (matched.length > 0) {
    const unique = [...new Set(matched)];
    const score = Math.min(100, 45 + unique.length * 10);
    signals.push({
      token_id: tokenId,
      signal_type: "news_event",
      severity: severityFor(score),
      score,
      evidence: { matched_keywords: unique },
    });
  }

  // Multiple signal types on the same token → +10 each (capped 100).
  if (signals.length > 1) {
    for (const s of signals) {
      s.score = Math.min(100, s.score + 10);
      s.severity = severityFor(s.score);
    }
  }

  return signals;
}

export async function runIngestion(): Promise<IngestResult> {
  const db = createAdminClient();
  const errors: string[] = [];
  const result: IngestResult = {
    ok: true,
    tokens_upserted: 0,
    snapshots_inserted: 0,
    news_inserted: 0,
    signals_inserted: 0,
    ai: process.env.OPENAI_API_KEY ? "openai" : "rule-based",
    errors,
  };

  // ── Load tracked tokens ─────────────────────────────────────────────────
  const { data: tracked, error: tokErr } = await db
    .from("tokens")
    .select("id, symbol, name, coingecko_id")
    .eq("is_tracked", true);
  if (tokErr) {
    errors.push(`load tokens: ${tokErr.message}`);
    result.ok = false;
    await logAudit(db, {
      action: "ingestion_run",
      status: "error",
      output_summary: tokErr.message,
    });
    return result;
  }
  const tokens = tracked ?? [];

  // ── Fetch live market data (top-100 + tracked extras) ───────────────────
  let markets: CoinGeckoMarket[] = [];
  try {
    markets = await fetchMarkets(tokens.map((t) => t.coingecko_id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`coingecko: ${msg}`);
    result.ok = false;
    await logAudit(db, {
      action: "ingestion_run",
      tool_used: "coingecko_fetch",
      status: "error",
      output_summary: msg,
    });
    // Continue: we can still (re)derive news signals from existing data.
  }
  const marketById = new Map(markets.map((m) => [m.id, m]));

  // ── Upsert any newly-seen tokens so the whole top-100 is tracked ────────
  if (markets.length > 0) {
    const known = new Set(tokens.map((t) => t.coingecko_id));
    const newRows = markets
      .filter((m) => !known.has(m.id))
      .map((m) => ({
        symbol: m.symbol.toUpperCase(),
        name: m.name,
        coingecko_id: m.id,
        is_tracked: true,
      }));
    if (newRows.length > 0) {
      const { data: inserted, error } = await db
        .from("tokens")
        .upsert(newRows, { onConflict: "coingecko_id", ignoreDuplicates: true })
        .select("id, symbol, name, coingecko_id");
      if (error) errors.push(`tokens upsert: ${error.message}`);
      else if (inserted) tokens.push(...inserted);
    }
  }

  // ── Upsert snapshots ────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const snapshotRows = tokens
    .map((t) => {
      const m = marketById.get(t.coingecko_id);
      if (!m) return null;
      return {
        token_id: t.id,
        fetched_at: nowIso,
        price_usd: m.current_price,
        volume_24h: m.total_volume,
        price_change_24h_pct: m.price_change_percentage_24h,
        market_cap: m.market_cap,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (snapshotRows.length > 0) {
    const { error } = await db.from("token_snapshots").insert(snapshotRows);
    if (error) errors.push(`snapshots: ${error.message}`);
    else result.snapshots_inserted = snapshotRows.length;
  }

  // ── Fetch + tag news ────────────────────────────────────────────────────
  try {
    const news = await fetchNews();
    const symbolToId = new Map(tokens.map((t) => [t.symbol.toLowerCase(), t.id]));
    const nameToId = new Map(tokens.map((t) => [t.name.toLowerCase(), t.id]));
    const rows = news
      .map((n) => {
        const keywords = matchKeywords(n.headline);
        // Attach to a token if its symbol/name appears in the headline.
        const lower = n.headline.toLowerCase();
        let tokenId: string | null = null;
        for (const [sym, id] of symbolToId) {
          if (new RegExp(`\\b${sym}\\b`).test(lower)) tokenId = id;
        }
        if (!tokenId) {
          for (const [name, id] of nameToId) {
            if (lower.includes(name)) tokenId = id;
          }
        }
        if (!tokenId && keywords.length === 0) return null;
        return {
          token_id: tokenId,
          headline: n.headline,
          url: n.url,
          source: n.source,
          published_at: n.published_at,
          keywords,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await db.from("news_items").insert(rows);
      if (error) errors.push(`news: ${error.message}`);
      else result.news_inserted = rows.length;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`cryptopanic: ${msg}`);
    // Non-fatal: existing news_items still drive news_event signals.
  }

  // ── Compute 7-day rolling avg volume per token ──────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const avgVol = new Map<string, number>();
  {
    const { data: hist } = await db
      .from("token_snapshots")
      .select("token_id, volume_24h, fetched_at")
      .gte("fetched_at", sevenDaysAgo);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const row of hist ?? []) {
      if (row.volume_24h == null) continue;
      const cur = acc.get(row.token_id) ?? { sum: 0, n: 0 };
      cur.sum += Number(row.volume_24h);
      cur.n += 1;
      acc.set(row.token_id, cur);
    }
    for (const [id, { sum, n }] of acc) if (n > 0) avgVol.set(id, sum / n);
  }

  // ── Recent news per token (last 24h) ────────────────────────────────────
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const newsByToken = new Map<string, { keywords: string[] }[]>();
  {
    const { data: recentNews } = await db
      .from("news_items")
      .select("token_id, keywords, published_at")
      .gte("published_at", dayAgo);
    for (const n of recentNews ?? []) {
      if (!n.token_id) continue;
      const arr = newsByToken.get(n.token_id) ?? [];
      arr.push({ keywords: n.keywords ?? [] });
      newsByToken.set(n.token_id, arr);
    }
  }

  // ── Detect signals ──────────────────────────────────────────────────────
  const allSignals: (ScoredSignal & { symbol: string; name: string })[] = [];
  for (const t of tokens) {
    const m = marketById.get(t.coingecko_id);
    const detected = detectSignals({
      tokenId: t.id,
      symbol: t.symbol,
      volume24h: m?.total_volume ?? null,
      avgVolume7d: avgVol.get(t.id) ?? null,
      priceChangePct: m?.price_change_percentage_24h ?? null,
      news: newsByToken.get(t.id) ?? [],
    });
    for (const s of detected) allSignals.push({ ...s, symbol: t.symbol, name: t.name });
  }

  // ── Age out stale signals, then replace regenerated (token,type) pairs ───
  await db.from("signals").delete().lt("triggered_at", sevenDaysAgo);
  if (allSignals.length > 0) {
    const tokenIds = [...new Set(allSignals.map((s) => s.token_id))];
    const types = [...new Set(allSignals.map((s) => s.signal_type))];
    // Remove existing signals for the exact (token,type) combos we're refreshing.
    await db
      .from("signals")
      .delete()
      .in("token_id", tokenIds)
      .in("signal_type", types)
      .gte("triggered_at", sevenDaysAgo);
  }

  // ── Generate summaries + insert ─────────────────────────────────────────
  // AI summaries only for the top-scored signals (the ones the Digest shows);
  // the long tail gets the instant rule-based sentence. Keeps the run inside
  // the 60s function budget even with ~100 tokens scanned.
  const AI_SUMMARY_LIMIT = 12;
  allSignals.sort((a, b) => b.score - a.score);
  const rows = [];
  for (const [i, s] of allSignals.entries()) {
    const { summary, source, confidence } = await generateSummary(
      {
        symbol: s.symbol,
        name: s.name,
        signalType: s.signal_type,
        score: s.score,
        evidence: s.evidence,
      },
      { allowAi: i < AI_SUMMARY_LIMIT },
    );
    rows.push({
      token_id: s.token_id,
      signal_type: s.signal_type,
      severity: s.severity,
      score: s.score,
      summary,
      summary_source: source,
      summary_confidence: confidence,
      summary_review_status: "unreviewed",
      triggered_at: nowIso,
    });
  }
  if (rows.length > 0) {
    const { error } = await db.from("signals").insert(rows);
    if (error) {
      errors.push(`signals: ${error.message}`);
      result.ok = false;
    } else {
      result.signals_inserted = rows.length;
    }
  }

  result.tokens_upserted = tokens.length;
  await logAudit(db, {
    action: "ingestion_run",
    tool_used: "coingecko_fetch",
    status: result.ok ? "ok" : "error",
    output_summary: `snapshots=${result.snapshots_inserted} news=${result.news_inserted} signals=${result.signals_inserted} ai=${result.ai}`,
  });

  return result;
}
