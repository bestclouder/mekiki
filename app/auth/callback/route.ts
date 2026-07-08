import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /auth/callback — exchanges the magic-link / email-confirm code for a
 * session cookie, then redirects home. Also links any Pro subscription that
 * was purchased anonymously with this email.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Best-effort: attach a prior anonymous Pro subscription to this user.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          const { linkSubscriptionByEmail } = await import("@/lib/subscription-link");
          await linkSubscriptionByEmail(user.id, user.email);
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
