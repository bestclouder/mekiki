"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type State =
  | { kind: "loading" }
  | { kind: "pro"; email: string | null }
  | { kind: "pending" }
  | { kind: "error"; message: string };

export default function SuccessClient({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({ kind: "error", message: "No checkout session found." });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/confirm?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (res.ok && data.pro) {
          // Unlock Pro detail for this browser session.
          localStorage.setItem("mekiki_pro", "1");
          if (data.email) localStorage.setItem("mekiki_pro_email", data.email);
          setState({ kind: "pro", email: data.email ?? null });
        } else if (res.ok) {
          setState({ kind: "pending" });
        } else {
          setState({ kind: "error", message: data.error ?? "Could not confirm payment." });
        }
      } catch {
        setState({ kind: "error", message: "Network error confirming payment." });
      }
    })();
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-2xl border p-8 text-center"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border-strong)" }}
      >
        {state.kind === "loading" && (
          <>
            <div className="text-3xl mb-3">⏳</div>
            <p className="font-medium">Confirming your payment…</p>
          </>
        )}

        {state.kind === "pro" && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h1 className="text-xl font-semibold">You&apos;re Pro</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {state.email ? `Subscription active for ${state.email}. ` : ""}
              Full signal detail — raw evidence and news snippets — is now unlocked.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block px-5 py-2.5 rounded-xl font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Back to the Digest
            </Link>
          </>
        )}

        {state.kind === "pending" && (
          <>
            <div className="text-3xl mb-3">⌛</div>
            <p className="font-medium">Payment is processing</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              We&apos;ll unlock Pro as soon as it clears.
            </p>
            <Link href="/" className="mt-6 inline-block text-sm" style={{ color: "var(--accent)" }}>
              Back to the Digest
            </Link>
          </>
        )}

        {state.kind === "error" && (
          <>
            <div className="text-3xl mb-3">⚠️</div>
            <p className="font-medium">Something went wrong</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {state.message}
            </p>
            <Link href="/" className="mt-6 inline-block text-sm" style={{ color: "var(--accent)" }}>
              Back to the Digest
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
