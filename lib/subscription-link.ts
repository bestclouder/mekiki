import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Link any anonymously-purchased Pro subscription (matched by email) to the
 * now-authenticated user. Uses the admin client so it works after the Sprint 4
 * owner RLS lockdown (service-role bypasses RLS; anon works pre-lockdown).
 */
export async function linkSubscriptionByEmail(
  userId: string,
  email: string,
): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("subscriptions")
    .update({ user_id: userId })
    .eq("email", email)
    .is("user_id", null)
    .select("id");
  if (error) throw new Error(error.message);
  const n = data?.length ?? 0;
  if (n > 0) {
    await db.from("audit_logs").insert({
      action: "link_subscription",
      tool_used: "supabase",
      status: "ok",
      risk_level: "medium",
      triggered_by: "auth_callback",
      output_summary: `linked ${n} subscription(s) to user ${userId}`,
    });
  }
  return n;
}
