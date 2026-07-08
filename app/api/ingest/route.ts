import { runIngestion } from "@/lib/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ingestion endpoint — the core engine.
 *
 * GET  → invoked by Vercel Cron every 30 min (see vercel.json).
 * POST → invoked by the Digest page's manual "Refresh" button.
 *
 * If CRON_SECRET is set, the cron GET must present it as a Bearer token.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → open (demo mode)
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  // Manual refresh (POST) is always allowed for the public demo; the cron GET
  // is gated by CRON_SECRET when configured.
  if (request.method === "GET" && !authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runIngestion();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ingest]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
