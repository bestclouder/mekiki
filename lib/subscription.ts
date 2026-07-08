import { createAdminClient } from "@/lib/supabase/admin";
import { emailTag } from "@/lib/pii";

/**
 * Record a Pro subscription (High-risk create_subscription action per
 * docs/AGENTIC_LAYER.md). Idempotent on stripe_session_id so the webhook and
 * the post-checkout confirmation can't create duplicate rows.
 */
export async function recordProSubscription(input: {
  email: string | null;
  stripeCustomerId: string | null;
  stripeSessionId: string;
  userId?: string | null;
  triggeredBy: string;
}): Promise<{ created: boolean; id: string | null }> {
  const db = createAdminClient();

  const { data: existing } = await db
    .from("subscriptions")
    .select("id")
    .eq("stripe_session_id", input.stripeSessionId)
    .maybeSingle();

  if (existing) return { created: false, id: existing.id };

  const { data, error } = await db
    .from("subscriptions")
    .insert({
      user_id: input.userId ?? null,
      email: input.email,
      stripe_customer_id: input.stripeCustomerId,
      stripe_session_id: input.stripeSessionId,
      tier: "pro",
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await db.from("audit_logs").insert({
    action: "create_subscription",
    tool_used: "stripe",
    status: "ok",
    risk_level: "high",
    triggered_by: input.triggeredBy,
    // No raw PII in audit summaries — hashed email tag + Stripe session only.
    output_summary: `tier=pro ${emailTag(input.email)} session=${input.stripeSessionId}`,
  });

  return { created: true, id: data.id };
}
