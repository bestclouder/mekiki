import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/candles?symbol=SOL&id=solana
 *
 * 48h of price candles for the detail chart.
 * 1. Binance public klines — true 5-minute OHLC, no API key (576 candles).
 * 2. Fallback: CoinGecko market_chart (hourly closes for 2 days) for tokens
 *    without a Binance USDT pair — returned as 1h pseudo-candles so the chart
 *    still renders, with granularity flagged.
 *
 * Server-side proxy keeps the browser off third-party APIs (CORS + no keys in
 * client) and lets us cache for 5 min.
 */

export type Candle = {
  t: number; // open time (ms)
  o: number;
  h: number;
  l: number;
  c: number;
};

const H48 = 48 * 3600 * 1000;

async function binanceCandles(symbol: string): Promise<Candle[] | null> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=576`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null; // unknown pair → -1121 error with 400
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) return null;
  const cutoff = Date.now() - H48;
  return (raw as (string | number)[][])
    .map((k) => ({
      t: Number(k[0]),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4]),
    }))
    .filter((c) => c.t >= cutoff && Number.isFinite(c.c));
}

async function coingeckoCandles(id: string): Promise<Candle[] | null> {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", "2");
  if (process.env.COINGECKO_API_KEY) {
    url.searchParams.set("x_cg_demo_api_key", process.env.COINGECKO_API_KEY);
  }
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { prices?: [number, number][] };
  const prices = data.prices ?? [];
  if (prices.length < 2) return null;
  // Hourly closes → pseudo-candles: o = previous close, h/l span the pair.
  const candles: Candle[] = [];
  for (let i = 1; i < prices.length; i++) {
    const [t, c] = prices[i];
    const o = prices[i - 1][1];
    candles.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c });
  }
  return candles;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const id = url.searchParams.get("id")?.trim() ?? "";

  if (!symbol && !id) {
    return NextResponse.json({ error: "symbol or id required" }, { status: 400 });
  }

  try {
    if (symbol && /^[A-Za-z0-9]{1,12}$/.test(symbol)) {
      const candles = await binanceCandles(symbol);
      if (candles && candles.length > 10) {
        return NextResponse.json({
          candles,
          granularity: "5m",
          source: "binance",
        });
      }
    }
    if (id) {
      const candles = await coingeckoCandles(id);
      if (candles && candles.length > 2) {
        return NextResponse.json({
          candles,
          granularity: "1h",
          source: "coingecko",
        });
      }
    }
    return NextResponse.json(
      { error: "No chart data available for this token." },
      { status: 404 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/candles]", msg);
    return NextResponse.json({ error: "Chart data fetch failed." }, { status: 502 });
  }
}
