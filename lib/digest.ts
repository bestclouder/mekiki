import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Digest query — ranks the top signals for the public homepage.
 *
 * Reads are open under v1 permissive RLS. Returns each signal joined with its
 * token and the latest market snapshot, plus (for the Pro detail panel) the
 * recent news items and raw evidence for that token.
 */

export type NewsSnippet = {
  headline: string;
  url: string | null;
  source: string | null;
  keywords: string[];
  published_at: string | null;
};

export type DigestCard = {
  id: string;
  symbol: string;
  name: string;
  coingecko_id: string | null;
  signal_type: string;
  severity: string;
  score: number;
  summary: string | null;
  summary_source: string | null;
  summary_confidence: number | null;
  triggered_at: string;
  price_usd: number | null;
  price_change_24h_pct: number | null;
  volume_24h: number | null;
  news: NewsSnippet[];
};

export type Digest = {
  cards: DigestCard[];
  fetched_at: string;
  last_run_at: string | null;
};

export async function getDigest(limit = 20): Promise<Digest> {
  const db = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: signals, error } = await db
    .from("signals")
    .select(
      "id, signal_type, severity, score, summary, summary_source, summary_confidence, triggered_at, token_id, tokens(symbol, name, coingecko_id)",
    )
    .gte("triggered_at", sevenDaysAgo)
    .order("score", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  // One card per token — its highest-scoring signal — then top N tokens by
  // score ("Top 10 tokens by score → Digest", docs/INTELLIGENCE_LAYER.md).
  const seen = new Set<string>();
  const rows = (signals ?? []).filter((r) => {
    if (!r.token_id || seen.has(r.token_id)) return false;
    seen.add(r.token_id);
    return true;
  }).slice(0, limit);
  const signalTokenIds = new Set(rows.map((r) => r.token_id));

  // Latest snapshot per token — ALL tokens from the most recent scan, so the
  // digest can fill remaining slots with the day's biggest movers.
  const latestSnap = new Map<
    string,
    {
      price_usd: number | null;
      price_change_24h_pct: number | null;
      volume_24h: number | null;
      token: { symbol: string; name: string; coingecko_id: string | null } | null;
    }
  >();
  {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: snaps } = await db
      .from("token_snapshots")
      .select(
        "token_id, price_usd, price_change_24h_pct, volume_24h, fetched_at, tokens(symbol, name, coingecko_id)",
      )
      .gte("fetched_at", dayAgo)
      .order("fetched_at", { ascending: false })
      .limit(600);
    for (const s of snaps ?? []) {
      if (s.token_id && !latestSnap.has(s.token_id)) {
        latestSnap.set(s.token_id, {
          price_usd: s.price_usd,
          price_change_24h_pct: s.price_change_24h_pct,
          volume_24h: s.volume_24h,
          token: (s.tokens as unknown as {
            symbol: string;
            name: string;
            coingecko_id: string | null;
          } | null),
        });
      }
    }
  }

  // Recent news per token (detail panel).
  const newsByToken = new Map<string, NewsSnippet[]>();
  const tokenIds = [...signalTokenIds];
  if (tokenIds.length > 0) {
    const { data: news } = await db
      .from("news_items")
      .select("token_id, headline, url, source, keywords, published_at")
      .in("token_id", tokenIds)
      .order("published_at", { ascending: false });
    for (const n of news ?? []) {
      if (!n.token_id) continue;
      const arr = newsByToken.get(n.token_id) ?? [];
      if (arr.length < 3)
        arr.push({
          headline: n.headline,
          url: n.url,
          source: n.source,
          keywords: n.keywords ?? [],
          published_at: n.published_at,
        });
      newsByToken.set(n.token_id, arr);
    }
  }

  // Most recent ingestion run (for "scanned X min ago").
  const { data: lastRun } = await db
    .from("audit_logs")
    .select("created_at")
    .eq("action", "ingestion_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cards: DigestCard[] = rows.map((r) => {
    const token = r.tokens as unknown as {
      symbol: string;
      name: string;
      coingecko_id: string | null;
    } | null;
    const snap = latestSnap.get(r.token_id);
    return {
      id: r.id,
      symbol: token?.symbol ?? "—",
      name: token?.name ?? "Unknown",
      coingecko_id: token?.coingecko_id ?? null,
      signal_type: r.signal_type,
      severity: r.severity,
      score: Number(r.score),
      summary: r.summary,
      summary_source: r.summary_source,
      summary_confidence: r.summary_confidence != null ? Number(r.summary_confidence) : null,
      triggered_at: r.triggered_at,
      price_usd: snap?.price_usd ?? null,
      price_change_24h_pct: snap?.price_change_24h_pct ?? null,
      volume_24h: snap?.volume_24h ?? null,
      news: newsByToken.get(r.token_id) ?? [],
    };
  });

  // Fill remaining slots with the day's biggest movers (no abnormal signal —
  // just honest market data), ranked by |24h change|.
  if (cards.length < limit) {
    const movers = [...latestSnap.entries()]
      .filter(([id, s]) => !signalTokenIds.has(id) && s.token && s.price_change_24h_pct != null)
      .sort(
        (a, b) =>
          Math.abs(b[1].price_change_24h_pct ?? 0) - Math.abs(a[1].price_change_24h_pct ?? 0),
      )
      .slice(0, limit - cards.length);
    for (const [id, s] of movers) {
      const pct = s.price_change_24h_pct ?? 0;
      const dir = pct >= 0 ? "up" : "down";
      cards.push({
        id: `mover-${id}`,
        symbol: s.token!.symbol,
        name: s.token!.name,
        coingecko_id: s.token!.coingecko_id,
        signal_type: "market_mover",
        severity: "low",
        score: Math.min(29, Math.round(Math.abs(pct))),
        summary: `${s.token!.symbol} is ${dir} ${Math.abs(pct).toFixed(2)}% in 24h — no abnormal signal, but among today's biggest movers.`,
        summary_source: "rule-based",
        summary_confidence: null,
        triggered_at: new Date().toISOString(),
        price_usd: s.price_usd,
        price_change_24h_pct: s.price_change_24h_pct,
        volume_24h: s.volume_24h,
        news: [],
      });
    }
  }

  return {
    cards,
    fetched_at: new Date().toISOString(),
    last_run_at: lastRun?.created_at ?? null,
  };
}
