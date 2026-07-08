import { getDigest } from "@/lib/digest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/digest — ranked signals for the public homepage. */
export async function GET() {
  try {
    const digest = await getDigest();
    return NextResponse.json(digest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/digest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
