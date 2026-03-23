"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Login failed.");
      }

      const redirectTo = searchParams.get("redirect") || "/leads";
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(249,115,22,0.14), transparent 28%), var(--bg)",
        color: "var(--fg)",
      }}
    >
      <div className="glass-panel w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em]" style={{ color: "var(--fg-subtle)" }}>
            Admin Access
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Sign in to the dashboard</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            Use the admin email and password to view captured conversations and leads.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
              style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
              style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ border: "1px solid #ef4444", color: "#ef4444" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #f97316)" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <AdminLoginForm />
    </Suspense>
  );
}
