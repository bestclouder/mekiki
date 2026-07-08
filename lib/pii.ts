import { createHash } from "crypto";

/**
 * Never store raw PII (emails) in audit_logs.output_summary — that table is
 * readable under permissive RLS and, once locked, is still readable by admins.
 * Store a stable, non-reversible fingerprint instead: enough to correlate rows
 * for the same user across events, useless for extracting the address.
 *
 * Format: `email#<12 hex>` (SHA-256 prefix). Two events for the same email
 * produce the same tag; the address cannot be recovered from it.
 */
export function emailTag(email: string | null | undefined): string {
  if (!email) return "email#none";
  const digest = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return `email#${digest}`;
}
