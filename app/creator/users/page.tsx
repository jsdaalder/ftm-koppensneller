"use client";

import { useEffect, useMemo, useState } from "react";

type KnownUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  return { error: text || `HTTP ${res.status}` };
}

function fmt(dateString: string | null): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleString("nl-NL");
  } catch {
    return dateString;
  }
}

export default function CreatorUsersPage() {
  const [users, setUsers] = useState<KnownUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
  }, [users, query]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/creator/users");
        const json = await readJson(res);
        const err = typeof json.error === "string" ? json.error : "";
        if (!res.ok) throw new Error(err || "Kon users niet laden.");
        const list = Array.isArray(json.users) ? (json.users as KnownUser[]) : [];
        if (!active) return;
        setUsers(list);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Onbekende fout.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <h1 className="ftm-coach-h1">Known users</h1>
            <div style={{ display: "flex", gap: 10 }}>
              <a className="ftm-coach-btn ftm-coach-btn-dark" href="/creator" style={{ textDecoration: "none" }}>
                Control panel
              </a>
              <a className="ftm-coach-btn ftm-coach-btn-dark" href="/creator/queue" style={{ textDecoration: "none" }}>
                Creator Queue
              </a>
            </div>
          </div>
          <p className="ftm-coach-meta">
            {loading ? "Laden..." : `${users.length} users geladen.`}
          </p>
          {error && <p className="ftm-coach-meta" style={{ color: "#8a2426" }}>{error}</p>}
          <label className="ftm-coach-label">Zoeken</label>
          <input
            className="ftm-coach-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="email of user id"
          />
        </div>

        <div className="ftm-coach-card">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #d8d1c4" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #d8d1c4" }}>User ID</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #d8d1c4" }}>Created</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #d8d1c4" }}>Last sign-in</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #d8d1c4" }}>Email confirmed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee6da" }}>{u.email ?? "-"}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee6da", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {u.id}
                    </td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee6da" }}>{fmt(u.created_at)}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee6da" }}>{fmt(u.last_sign_in_at)}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee6da" }}>{fmt(u.email_confirmed_at)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ftm-coach-meta" style={{ padding: "10px 6px" }}>
                      Geen resultaten.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

