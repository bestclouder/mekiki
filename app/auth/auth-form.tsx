"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const supabase = createClient();
  const isLogin = mode === "login";

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) window.location.href = "/";
        else setMsg({ kind: "ok", text: "Check your email to confirm your account." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email) {
      setMsg({ kind: "err", text: "Enter your email first." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg({ kind: "ok", text: "Magic link sent — check your email." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Could not send link." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-2xl border p-7"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border-strong)" }}
      >
        <Link href="/" className="flex items-center gap-2 mb-6">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            目
          </span>
          <span className="font-semibold">Mekiki</span>
        </Link>

        <h1 className="text-xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {isLogin ? "Access your Pro subscription." : "Save your Pro subscription to an account."}
        </p>

        <form onSubmit={submitPassword} className="mt-5 space-y-3">
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            style={{ background: "var(--bg)", borderColor: "var(--border-strong)", color: "var(--text)" }}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            style={{ background: "var(--bg)", borderColor: "var(--border-strong)", color: "var(--text)" }}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl font-medium transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {busy ? "…" : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs" style={{ color: "var(--text-faint)" }}>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          or
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <button
          onClick={magicLink}
          disabled={busy}
          className="w-full py-2.5 rounded-xl font-medium border transition-colors disabled:opacity-60"
          style={{ borderColor: "var(--border-strong)", color: "var(--text)" }}
        >
          Email me a magic link
        </button>

        {msg && (
          <p
            className="mt-4 text-sm text-center"
            style={{ color: msg.kind === "ok" ? "var(--pos)" : "var(--neg)" }}
          >
            {msg.text}
          </p>
        )}

        <p className="mt-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
          {isLogin ? (
            <>
              No account?{" "}
              <Link href="/signup" style={{ color: "var(--accent)" }}>
                Sign up
              </Link>
            </>
          ) : (
            <>
              Have an account?{" "}
              <Link href="/login" style={{ color: "var(--accent)" }}>
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
