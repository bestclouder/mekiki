import { stripe, stripeAccountOptions } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout — start a Pro-tier Stripe Checkout session.
 *
 * v1 is anonymous (no login wall): Stripe collects the email at checkout, and
 * the webhook / success confirmation records the subscription. Returns a
 * clear, non-crashing message when Stripe env isn't configured yet.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;

  if (!secret || !priceId || priceId === "price_") {
    return NextResponse.json(
      {
        error:
          "Pro checkout isn't configured yet. Add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PRICE_MONTHLY to enable it.",
      },
      { status: 501 },
    );
  }

  try {
    const origin =
      request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    let source = "";
    try {
      const body = await request.json();
      source = typeof body?.symbol === "string" ? body.symbol : "";
    } catch {
      /* body optional */
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=canceled`,
        metadata: { tier: "pro", source },
        subscription_data: { metadata: { tier: "pro" } },
      },
      stripeAccountOptions(),
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/checkout]", msg);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
