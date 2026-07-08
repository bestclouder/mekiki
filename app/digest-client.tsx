"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  market_mover: { label: "Mover", color: "var(--text-muted)", bg: "rgba(154,161,171,0.12)" },
};

function scoreColor(score: number): string {
  if (score >= 75) return "var(--pos)";
  if (score >= 50) return "var(--warn)";
  return "var(--text-muted)";
}

// ── candle chart ────────────────────────────────────────────────────────────
type Candle = { t: number; o: number; h: number; l: number; c: number };
type CandleResp = { candles: Candle[]; granularity: string; source: string };

const CH = 260; // chart height (px)
const PAD_TOP = 10;
const PAD_BOT = 22; // room for time labels
const CANDLE_W = 5; // body width
const CANDLE_GAP = 2;
const UP = "var(--pos)";
const DOWN = "var(--neg)";

function fmtTick(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(3);
}
function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function CandleChart({ card }: { card: DigestCard }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; data: CandleResp }
  >({ kind: "loading" });
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = new URLSearchParams();
        q.set("symbol", card.symbol);
        if (card.coingecko_id) q.set("id", card.coingecko_id);
        const res = await fetch(`/api/candles?${q}`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data.candles?.length) setState({ kind: "ready", data });
        else setState({ kind: "error", message: data.error ?? "No chart data." });
      } catch {
        if (alive) setState({ kind: "error", message: "Chart data fetch failed." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [card]);

  // Start scrolled to the latest candles.
  useEffect(() => {
    if (state.kind === "ready" && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [state]);

  if (state.kind === "loading") {
    return <div className="skeleton w-full" style={{ height: CH }} />;
  }
  if (state.kind === "error") {
    return (
      <div
        className="w-full flex items-center justify-center rounded-lg border border-dashed text-sm"
        style={{ height: CH, borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
      >
        {state.message}
      </div>
    );
  }

  const { candles, granularity, source } = state.data;
  const n = candles.length;
  const slot = CANDLE_W + CANDLE_GAP;
  const width = Math.max(n * slot + 8, 320);
  const plotH = CH - PAD_TOP - PAD_BOT;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.l < lo) lo = c.l;
    if (c.h > hi) hi = c.h;
  }
  const span = hi - lo || hi * 0.01 || 1;
  const y = (p: number) => PAD_TOP + plotH - ((p - lo) / span) * plotH;

  // ~4 clean horizontal gridlines.
  const ticks = [0, 1, 2, 3].map((i) => lo + (span * i) / 3);
  // Time labels roughly every half-day across the 3.5-day window.
  const timeIdx = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    Math.min(n - 1, Math.floor((n - 1) * (i / 7))),
  );

  const hovered = hover ? candles[hover.i] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          {granularity === "5m"
            ? "5-min candles · last 3.5 days"
            : "hourly candles · last 3.5 days (no 5-min feed for this token)"}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {source}
        </span>
      </div>

      {/* fixed OHLC readout — no layout jump on hover */}
      <div className="flex gap-3 text-[11px] tabular-nums mb-1.5 flex-wrap" style={{ color: "var(--text-muted)" }}>
        {hovered ? (
          <>
            <span>{fmtTime(hovered.t)}</span>
            <span>O {fmtTick(hovered.o)}</span>
            <span>H {fmtTick(hovered.h)}</span>
            <span>L {fmtTick(hovered.l)}</span>
            <span style={{ color: hovered.c >= hovered.o ? "var(--pos)" : "var(--neg)" }}>
              C {fmtTick(hovered.c)}
            </span>
          </>
        ) : (
          <span>hover for OHLC · range {fmtTick(lo)} – {fmtTick(hi)}</span>
        )}
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        >
          <svg
            width={width}
            height={CH}
            style={{ display: "block" }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const i = Math.max(0, Math.min(n - 1, Math.floor(x / slot)));
              setHover({ i, x: i * slot + CANDLE_W / 2 });
            }}
            onMouseLeave={() => setHover(null)}
          >
            {/* hairline gridlines */}
            {ticks.map((p) => (
              <line
                key={p}
                x1={0}
                x2={width}
                y1={y(p)}
                y2={y(p)}
                stroke="var(--border)"
                strokeWidth={1}
              />
            ))}

            {/* time labels along the bottom */}
            {timeIdx.map((i, k) => (
              <text
                key={k}
                x={Math.min(i * slot + 2, width - 74)}
                y={CH - 7}
                fontSize={9}
                fill="var(--text-faint)"
              >
                {fmtTime(candles[i].t)}
              </text>
            ))}

            {/* candlesticks — wick spans high→low, body spans open→close.
                Up: hollow green (outline). Down: solid red. Color + fill style
                together, so direction never rides on hue alone. */}
            {candles.map((c, i) => {
              const up = c.c >= c.o;
              const color = up ? UP : DOWN;
              const cx = i * slot + CANDLE_W / 2;
              const bodyTop = y(Math.max(c.o, c.c));
              const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
              return (
                <g key={c.t}>
                  {/* upper wick */}
                  <line x1={cx} x2={cx} y1={y(c.h)} y2={bodyTop} stroke={color} strokeWidth={1} />
                  {/* lower wick */}
                  <line
                    x1={cx}
                    x2={cx}
                    y1={bodyTop + bodyH}
                    y2={y(c.l)}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* body */}
                  {up ? (
                    <rect
                      x={i * slot + 0.5}
                      y={bodyTop}
                      width={CANDLE_W - 1}
                      height={bodyH}
                      fill="var(--bg)"
                      stroke={color}
                      strokeWidth={1}
                    />
                  ) : (
                    <rect x={i * slot} y={bodyTop} width={CANDLE_W} height={bodyH} fill={color} />
                  )}
                </g>
              );
            })}

            {/* crosshair */}
            {hover && (
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD_TOP}
                y2={CH - PAD_BOT}
                stroke="var(--text-faint)"
                strokeWidth={1}
                strokeDasharray="none"
                opacity={0.6}
              />
            )}
          </svg>
        </div>

        {/* price axis pinned over the right edge */}
        <div className="absolute top-0 right-0 h-full pointer-events-none pr-1.5">
          {ticks.map((p) => (
            <span
              key={p}
              className="absolute right-1.5 text-[9px] tabular-nums px-1 rounded"
              style={{
                top: PAD_TOP + (CH - PAD_TOP - PAD_BOT) - ((p - lo) / span) * (CH - PAD_TOP - PAD_BOT) - 6,
                color: "var(--text-muted)",
                background: "color-mix(in srgb, var(--bg) 75%, transparent)",
              }}
            >
              {fmtTick(p)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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
      className="rounded-xl border p-4 sm:p-5 flex gap-4 transition-colors hover:border-[var(--border-strong)] cursor-pointer"
      onClick={() => onDetails(card)}
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
          {conf != null && (
            <span
              className="px-2 py-0.5 rounded-full"
              style={{
                color: isAI ? "var(--accent)" : "var(--text-muted)",
                background: isAI ? "var(--accent-soft)" : "var(--bg-elev-2)",
              }}
            >
              {isAI ? "AI" : "Rule"} · {conf}% confident
            </span>
          )}
          <span
            className="ml-auto text-xs font-medium px-3 py-1 rounded-lg border transition-colors hover:bg-[var(--bg-elev-2)]"
            style={{ borderColor: "var(--border-strong)", color: "var(--text)" }}
          >
            See details →
          </span>
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

// ── detail modal (open to everyone) ─────────────────────────────────────────
function fmtDetail(card: DigestCard) {
  return [
    { label: "Score", value: `${card.score} / 100` },
    { label: "Severity", value: card.severity },
    { label: "Signal", value: card.signal_type.replace(/_/g, " ") },
    { label: "Price", value: fmtPrice(card.price_usd) },
    { label: "24h change", value: fmtPct(card.price_change_24h_pct) },
    { label: "24h volume", value: fmtVol(card.volume_24h) },
  ];
}

function DetailModal({ card, onClose }: { card: DigestCard; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {card.symbol}
            <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-muted)" }}>
              {card.name}
            </span>
          </h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} className="text-xl leading-none">
            ×
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <CandleChart card={card} />

          <p className="text-sm leading-relaxed">{card.summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fmtDetail(card).map((d) => (
              <div key={d.label} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  {d.label}
                </div>
                <div className="text-sm font-medium mt-0.5 capitalize">{d.value}</div>
              </div>
            ))}
          </div>

          {card.news.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-faint)" }}>
                Related news
              </div>
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
          )}
        </div>
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
            Top 20 from the latest scan — abnormal volume, price swings, and news first, biggest movers after.
          </p>
        </div>

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
          Market data from CoinGecko &amp; Binance · Signals are rule-based, not financial advice
        </footer>
      </main>

      {modal && <DetailModal card={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
