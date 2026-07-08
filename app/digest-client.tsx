"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Digest, DigestCard } from "@/lib/digest";

// ── formatting helpers ────────────────────────────────────────────────────
function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`;
}
function fmtVol(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function agoMin(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return `${h}h ago`;
}

const BADGES: Record<string, { label: string; color: string; bg: string }> = {
  volume_spike: { label: "Volume", color: "var(--violet)", bg: "rgba(167,139,250,0.12)" },
  price_move: { label: "Price", color: "var(--cyan)", bg: "rgba(34,211,238,0.12)" },
  news_event: { label: "News", color: "var(--warn)", bg: "rgba(251,191,36,0.12)" },
};

function scoreColor(score: number): string {
  if (score >= 75) return "var(--pos)";
  if (score >= 50) return "var(--warn)";
  return "var(--text-muted)";
}

// ── card ──────────────────────────────────────────────────────────────────
function Card({
  card,
  rank,
  onDetails,
}: {
  card: DigestCard;
  rank: number;
  onDetails: (c: DigestCard) => void;
}) {
  const badge = BADGES[card.signal_type] ?? {
    label: card.signal_type,
    color: "var(--text-muted)",
    bg: "rgba(154,161,171,0.12)",
  };
  const isAI = card.summary_source?.startsWith("openai");
  const conf = card.summary_confidence != null ? Math.round(card.summary_confidence * 100) : null;
  const change = card.price_change_24h_pct;

  return (
    <div
      style={{ background: "var(--bg-elev)", borderColor: "var(--border)" }}
      className="rounded-xl border p-4 sm:p-5 flex gap-4 transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="flex flex-col items-center pt-1 w-8 shrink-0">
        <span className="text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
          #{rank}
        </span>
        <div
          className="mt-2 text-2xl font-bold tabular-nums"
          style={{ color: scoreColor(card.score) }}
        >
          {card.score}
        </div>
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          score
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[15px]">{card.symbol}</span>
          <span className="text-sm truncate" style={{ color: "var(--text-muted)" }}>
            {card.name}
          </span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: badge.color, background: badge.bg }}
          >
            {badge.label}
          </span>
          {card.severity === "high" && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ color: "var(--neg)", background: "rgba(248,113,113,0.12)" }}
            >
              high
            </span>
          )}
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          {card.summary ?? (
            <span style={{ color: "var(--text-faint)" }} className="italic">
              Summary pending — signal detected, awaiting analysis…
            </span>
          )}
        </p>

        <div className="mt-3 flex items-center gap-4 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="tabular-nums">{fmtPrice(card.price_usd)}</span>
          {change != null && (
            <span className="tabular-nums font-medium" style={{ color: change >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {fmtPct(change)}
            </span>
          )}
          <span className="tabular-nums">Vol {fmtVol(card.volume_24h)}</span>
          <span
            className="px-2 py-0.5 rounded-full"
            style={{
              color: isAI ? "var(--accent)" : "var(--text-muted)",
              background: isAI ? "var(--accent-soft)" : "var(--bg-elev-2)",
            }}
          >
            {isAI ? "AI" : "Rule"}
            {conf != null ? ` · ${conf}% confident` : ""}
          </span>
          <button
            onClick={() => onDetails(card)}
            className="ml-auto text-xs font-medium px-3 py-1 rounded-lg border transition-colors hover:bg-[var(--bg-elev-2)]"
            style={{ borderColor: "var(--border-strong)", color: "var(--text)" }}
          >
            See details →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── skeleton ────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: "var(--bg-elev)", borderColor: "var(--border)" }} className="rounded-xl border p-5 flex gap-4">
      <div className="w-8 shrink-0 space-y-2">
        <div className="skeleton h-3 w-6" />
        <div className="skeleton h-6 w-8" />
      </div>
      <div className="flex-1 space-y-3">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  );
}

// ── Pro gate modal ──────────────────────────────────────────────────────────
function fmtDetail(card: DigestCard) {
  return [
    { label: "Score", value: `${card.score} / 100` },
    { label: "Severity", value: card.severity },
    { label: "Signal", value: card.signal_type.replace("_", " ") },
    { label: "Price", value: fmtPrice(card.price_usd) },
    { label: "24h change", value: fmtPct(card.price_change_24h_pct) },
    { label: "24h volume", value: fmtVol(card.volume_24h) },
    {
      label: "Confidence",
      value:
        card.summary_confidence != null
          ? `${Math.round(card.summary_confidence * 100)}% (${card.summary_source})`
          : "—",
    },
  ];
}

function ProModal({
  card,
  isPro,
  onClose,
}: {
  card: DigestCard;
  isPro: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upgrade = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: card.id, symbol: card.symbol }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setMsg(data.error ?? "Checkout unavailable. Try again later.");
    } catch {
      setMsg("Network error starting checkout.");
    } finally {
      setBusy(false);
    }
  }, [card]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {card.symbol} · full signal detail
          </h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} className="text-xl leading-none">
            ×
          </button>
        </div>

        {isPro ? (
          <div className="mt-4 space-y-4">
            <span
              className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
            >
              PRO · unlocked
            </span>
            <p className="text-sm leading-relaxed">{card.summary}</p>
            <div className="grid grid-cols-2 gap-2">
              {fmtDetail(card).map((d) => (
                <div key={d.label} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                    {d.label}
                  </div>
                  <div className="text-sm font-medium mt-0.5 capitalize">{d.value}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-faint)" }}>
                Related news
              </div>
              {card.news.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No recent news items for this token.
                </p>
              )}
              <div className="space-y-2">
                {card.news.map((n, i) => (
                  <a
                    key={i}
                    href={n.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm rounded-lg border p-3 hover:bg-[var(--bg-elev-2)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {n.headline}
                    {n.keywords.length > 0 && (
                      <span className="block mt-1 text-[11px]" style={{ color: "var(--warn)" }}>
                        {n.keywords.join(" · ")}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Blurred teaser of the gated content */}
            <div className="mt-4 relative">
              <div className="space-y-2 select-none" style={{ filter: "blur(5px)", pointerEvents: "none" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Raw evidence: volume ratio, exact price move, matched keywords.
                </p>
                {(card.news.length ? card.news : [{ headline: "Latest related headline preview", url: null, source: "news", keywords: [], published_at: null }]).map(
                  (n, i) => (
                    <div key={i} className="text-sm rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      {n.headline}
                    </div>
                  ),
                )}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2">
                <span className="text-2xl">🔒</span>
                <p className="text-sm font-medium">Pro unlocks full evidence + news snippets</p>
              </div>
            </div>

            <button
              onClick={upgrade}
              disabled={busy}
              className="mt-5 w-full py-2.5 rounded-xl font-medium transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {busy ? "Starting checkout…" : "Upgrade to Pro"}
            </button>
            {msg && (
              <p className="mt-3 text-xs text-center" style={{ color: "var(--warn)" }}>
                {msg}
              </p>
            )}
            <p className="mt-3 text-[11px] text-center" style={{ color: "var(--text-faint)" }}>
              Test mode · card 4242 4242 4242 4242
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
export default function DigestClient({ initial }: { initial: Digest }) {
  const [cards, setCards] = useState<DigestCard[]>(initial.cards);
  const [lastRun, setLastRun] = useState<string | null>(initial.last_run_at);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<DigestCard | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    setIsPro(localStorage.getItem("mekiki_pro") === "1");
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "canceled") setCanceled(true);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      // Run a fresh scan, then reload the ranked digest.
      const ingest = await fetch("/api/ingest", { method: "POST" });
      if (!ingest.ok && ingest.status !== 207) {
        throw new Error("scan failed");
      }
      const res = await fetch("/api/digest", { cache: "no-store" });
      if (!res.ok) throw new Error("digest fetch failed");
      const data: Digest = await res.json();
      setCards(data.cards);
      setLastRun(data.last_run_at);
    } catch {
      setError("Data fetch failed — showing last known results.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const showSkeleton = refreshing && cards.length === 0;
  const isEmpty = !refreshing && cards.length === 0;

  const scannedLabel = useMemo(() => agoMin(lastRun), [lastRun]);

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="border-b sticky top-0 z-10 backdrop-blur" style={{ borderColor: "var(--border)", background: "rgba(10,11,13,0.8)" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              目
            </span>
            <div>
              <h1 className="font-semibold leading-none">Mekiki</h1>
              <p className="text-[11px] leading-none mt-1" style={{ color: "var(--text-faint)" }}>
                crypto signal digest
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {isPro && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
              >
                PRO
              </span>
            )}
            <span className="text-xs hidden sm:inline" style={{ color: "var(--text-faint)" }}>
              scanned {scannedLabel}
            </span>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 flex items-center gap-1.5"
              style={{ borderColor: "var(--border-strong)", background: "var(--bg-elev)" }}
            >
              <span className={refreshing ? "spin inline-block" : "inline-block"}>↻</span>
              {refreshing ? "Scanning…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">Today&apos;s movers</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Ranked signals across abnormal volume, price swings, and news — refreshed every 30&nbsp;min.
          </p>
        </div>

        {canceled && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-sm flex items-center justify-between"
            style={{ borderColor: "var(--border-strong)", background: "var(--bg-elev)", color: "var(--text-muted)" }}
          >
            <span>Checkout canceled — no charge was made.</span>
            <button onClick={() => setCanceled(false)} style={{ color: "var(--text-faint)" }}>×</button>
          </div>
        )}

        {error && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.08)", color: "var(--neg)" }}
          >
            ⚠ {error}
          </div>
        )}

        {showSkeleton && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {isEmpty && (
          <div
            className="rounded-xl border border-dashed px-6 py-14 text-center"
            style={{ borderColor: "var(--border-strong)" }}
          >
            <p className="text-3xl mb-3">🛰️</p>
            <p className="font-medium">No signals yet</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              The next scan runs automatically. Or trigger one now.
            </p>
            <button
              onClick={refresh}
              className="mt-4 text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Run scan now
            </button>
          </div>
        )}

        {!showSkeleton && !isEmpty && (
          <div className={`space-y-3 ${refreshing ? "opacity-60 transition-opacity" : ""}`}>
            {cards.map((c, i) => (
              <Card key={c.id} card={c} rank={i + 1} onDetails={setModal} />
            ))}
          </div>
        )}

        <footer className="mt-10 pt-6 border-t text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}>
          Market data from CoinGecko · Signals are rule-based, not financial advice
        </footer>
      </main>

      {modal && <ProModal card={modal} isPro={isPro} onClose={() => setModal(null)} />}
    </div>
  );
}
