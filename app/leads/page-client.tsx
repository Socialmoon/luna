"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogOut, Mail, Phone, RefreshCcw, Search } from "lucide-react";

type SessionRow = {
  session_id: string;
  latest_topic: string | null;
  latest_query: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  negotiation_detected: boolean | null;
  updated_at: string;
};

type LeadsResponse = {
  sessions?: SessionRow[];
  error?: string;
};

function getSessionLabel(row: SessionRow) {
  return row.visitor_name || row.visitor_email || row.visitor_phone || "Anonymous visitor";
}

export default function LeadsDashboardClient() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [search, setSearch] = useState("");

  async function loadSessions(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/leads", { method: "GET", cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as LeadsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load dashboard data.");
      }

      setSessions(data.sessions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin-login";
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return sessions;

    return sessions.filter((session) =>
      [session.latest_topic, session.latest_query, session.visitor_name, session.visitor_email, session.visitor_phone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch))
    );
  }, [search, sessions]);

  const metrics = useMemo(
    () => ({
      total: sessions.length,
      contact: sessions.filter((session) => session.visitor_email || session.visitor_phone).length,
      negotiation: sessions.filter((session) => session.negotiation_detected).length,
    }),
    [sessions]
  );

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/chat" className="simple-link">
              Back to Luna
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">Captured conversations and contact details.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadSessions(true)} className="secondary-button" disabled={refreshing}>
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
            <button type="button" onClick={() => void handleLogout()} className="secondary-button">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>

        <main className="py-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="simple-panel p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Conversations</p>
              <p className="mt-2 text-3xl font-semibold">{metrics.total}</p>
            </div>
            <div className="simple-panel p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Contact Captured</p>
              <p className="mt-2 text-3xl font-semibold">{metrics.contact}</p>
            </div>
            <div className="simple-panel p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Negotiations</p>
              <p className="mt-2 text-3xl font-semibold">{metrics.negotiation}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-[var(--fg-subtle)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="simple-panel mt-5 p-8 text-center">Loading dashboard data...</div>
          ) : error ? (
            <div className="simple-panel mt-5 border-red-500/50 p-4 text-sm text-red-500">Failed to load dashboard data: {error}</div>
          ) : filteredSessions.length === 0 ? (
            <div className="simple-panel mt-5 p-8 text-center">No conversations found.</div>
          ) : (
            <>
              <div className="mt-5 hidden overflow-hidden rounded-[28px] border border-[var(--border)] lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-left">
                        <th className="p-4">Visitor</th>
                        <th className="p-4">Topic</th>
                        <th className="p-4">Query</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Phone</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSessions.map((row) => (
                        <tr key={row.session_id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="p-4 font-medium">{getSessionLabel(row)}</td>
                          <td className="p-4">{row.latest_topic ?? "General Inquiry"}</td>
                          <td className="max-w-md p-4">
                            <div className="line-clamp-2">{row.latest_query ?? "-"}</div>
                          </td>
                          <td className="p-4">{row.visitor_email ?? "-"}</td>
                          <td className="p-4">{row.visitor_phone ?? "-"}</td>
                          <td className="p-4">{row.negotiation_detected ? "Negotiation" : "Standard"}</td>
                          <td className="p-4">
                            <button type="button" onClick={() => setSelectedSession(row)} className="simple-link">
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:hidden">
                {filteredSessions.map((row) => (
                  <button
                    key={row.session_id}
                    type="button"
                    onClick={() => setSelectedSession(row)}
                    className="simple-panel p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{getSessionLabel(row)}</p>
                        <p className="mt-1 text-sm text-[var(--fg-muted)]">{row.latest_topic ?? "General Inquiry"}</p>
                      </div>
                      <span className="text-xs text-[var(--fg-subtle)]">{row.negotiation_detected ? "Negotiation" : "Standard"}</span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm text-[var(--fg-muted)]">{row.latest_query ?? "-"}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-4 sm:items-center"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{selectedSession.latest_topic ?? "General Inquiry"}</h2>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">{getSessionLabel(selectedSession)}</p>
              </div>
              <button type="button" onClick={() => setSelectedSession(null)} className="secondary-button">
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Email</p>
                <p className="mt-2 break-all text-sm">{selectedSession.visitor_email ?? "Not captured"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Phone</p>
                <p className="mt-2 text-sm">{selectedSession.visitor_phone ?? "Not captured"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Negotiation</p>
                <p className="mt-2 text-sm">{selectedSession.negotiation_detected ? "Yes" : "No"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Updated</p>
                <p className="mt-2 text-sm">{new Date(selectedSession.updated_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-subtle)]">Latest query</p>
              <p className="mt-2 text-sm leading-7">{selectedSession.latest_query ?? "No query saved."}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--fg-muted)]">
              <span className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {selectedSession.visitor_email ?? "No email"}
              </span>
              <span className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {selectedSession.visitor_phone ?? "No phone"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
