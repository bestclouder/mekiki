import { constructWebhookEvent } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordProSubscription } from "@/lib/subscription";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhook — Stripe webhook receiver.
 *
 * Verifies the signature BEFORE any DB write (docs/SECURITY.md). On a bad
 * signature: 400 + an audit_logs row. On checkout.session.completed: records
 * the Pro subscription (High-risk create_subscription action → audit logged).
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    await logWebhookFailure("missing signature or webhook secret");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logWebhookFailure(`signature verification failed: ${msg}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await recordProSubscription({
        email: session.customer_details?.email ?? session.customer_email ?? null,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : null,
        stripeSessionId: session.id,
        triggeredBy: "stripe_webhook",
      });
    }
  } catch (err) {
    console.error(`[api/webhook] handling ${event.type}:`, err);
    // Return 200 so Stripe doesn't hammer retries on a handler bug.
  }

  return NextResponse.json({ received: true });
}

async function logWebhookFailure(reason: string) {
  try {
    const db = createAdminClient();
    await db.from("audit_logs").insert({
      action: "webhook_verify",
      tool_used: "stripe",
      status: "error",
      risk_level: "high",
      triggered_by: "stripe_webhook",
      output_summary: reason,
    });
  } catch {
    /* never crash on logging */
  }
}
