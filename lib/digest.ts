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

export async function getDigest(limit = 10): Promise<Digest> {
  const db = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: signals, error } = await db
    .from("signals")
    .select(
      "id, signal_type, severity, score, summary, summary_source, summary_confidence, triggered_at, token_id, tokens(symbol, name)",
    )
    .gte("triggered_at", sevenDaysAgo)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = signals ?? [];
  const tokenIds = [...new Set(rows.map((r) => r.token_id).filter(Boolean))];

  // Latest snapshot per token.
  const latestSnap = new Map<
    string,
    { price_usd: number | null; price_change_24h_pct: number | null; volume_24h: number | null }
  >();
  if (tokenIds.length > 0) {
    const { data: snaps } = await db
      .from("token_snapshots")
      .select("token_id, price_usd, price_change_24h_pct, volume_24h, fetched_at")
      .in("token_id", tokenIds)
      .order("fetched_at", { ascending: false });
    for (const s of snaps ?? []) {
      if (!latestSnap.has(s.token_id)) {
        latestSnap.set(s.token_id, {
          price_usd: s.price_usd,
          price_change_24h_pct: s.price_change_24h_pct,
          volume_24h: s.volume_24h,
        });
      }
    }
  }

  // Recent news per token (Pro detail).
  const newsByToken = new Map<string, NewsSnippet[]>();
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
    const token = r.tokens as unknown as { symbol: string; name: string } | null;
    const snap = latestSnap.get(r.token_id);
    return {
      id: r.id,
      symbol: token?.symbol ?? "—",
      name: token?.name ?? "Unknown",
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

  return {
    cards,
    fetched_at: new Date().toISOString(),
    last_run_at: lastRun?.created_at ?? null,
  };
}
