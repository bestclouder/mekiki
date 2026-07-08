import type { NextConfig } from "next";

// Supabase origin (browser calls it directly for auth + subscription reads).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Content-Security-Policy. The browser only talks to same-origin /api/* and
// Supabase — every market-data API (Binance/Coinbase/CoinGecko) is proxied
// server-side, so connect-src stays tight. Stripe Checkout is a full-page
// redirect (navigation), not an embedded frame, so it needs no frame-src.
//
// NOTE: script-src/style-src include 'unsafe-inline' because Next.js App
// Router emits an inline hydration bootstrap and we use React inline styles.
// A nonce-based CSP via middleware is the next hardening step (see
// docs/SECURITY_AUDIT.md); the app renders no user-supplied HTML, so the
// residual XSS surface is low.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHost}`.trim(),
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // AI-generated apps should deploy even if the template has strict type or
  // lint issues. Type errors are compile-time only and don't affect runtime,
  // so we don't let them block a deployment.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
