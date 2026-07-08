import { stripe, stripeAccountOptions } from "@/lib/stripe";
import { recordProSubscription } from "@/lib/subscription";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/confirm?session_id=... — verify a completed Checkout session and
 * record the Pro subscription.
 *
 * This makes the checkout work end-to-end even without a public webhook
 * endpoint configured: the success page calls this, we retrieve the session
 * from Stripe, confirm it's paid, and upsert the subscription (idempotent —
 * safe alongside the webhook).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 501 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      stripeAccountOptions(),
    );

    const paid =
      session.payment_status === "paid" || session.status === "complete";
    if (!paid) {
      return NextResponse.json({ pro: false, status: session.status });
    }

    const email =
      session.customer_details?.email ?? session.customer_email ?? null;

    await recordProSubscription({
      email,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : null,
      stripeSessionId: session.id,
      triggeredBy: "checkout_confirm",
    });

    return NextResponse.json({ pro: true, email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/confirm]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
