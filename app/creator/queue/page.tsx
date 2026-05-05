"use client";

import { useEffect, useMemo, useState } from "react";

type QueueItem = {
  id: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
  reviewed_at: string | null;
  payload_json: unknown;
  review_notes: string | null;
  user_email?: string | null;
};

type ParsedRound = {
  round_number?: number;
  selected_indices?: number[];
  selected_headlines?: string[];
  suggestions_json?: unknown;
  feedback_text?: string;
  direction_tags?: string[];
};

type ParsedPayload = {
  profile_id?: string;
  session_id?: string;
  genre?: string;
  rounds?: ParsedRound[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "number" && Number.isFinite(x));
}

function extractSuggestionHeadlines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const h = (item as Record<string, unknown>).headline;
    if (typeof h === "string" && h.trim()) out.push(h.trim());
  }
  return out;
}

function deriveSelectedHeadlines(round: ParsedRound): string[] {
  const explicit = (round.selected_headlines ?? []).filter((h) => typeof h === "string" && h.trim());
  if (explicit.length) return explicit;
  const idx = asNumberArray(round.selected_indices);
  const all = extractSuggestionHeadlines(round.suggestions_json);
  const picked: string[] = [];
  for (const i of idx) {
    if (i >= 0 && i < all.length) picked.push(all[i]);
  }
  return picked;
}

function parsePayload(input: unknown): ParsedPayload {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const session = obj.session && typeof obj.session === "object" ? (obj.session as Record<string, unknown>) : {};
  const roundsRaw = Array.isArray(obj.rounds) ? (obj.rounds as unknown[]) : [];
  const rounds: ParsedRound[] = roundsRaw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const rr = r as Record<string, unknown>;
      const parsed: ParsedRound = {
        round_number: typeof rr.round_number === "number" ? rr.round_number : undefined,
        selected_indices: asNumberArray(rr.selected_indices),
        selected_headlines: Array.isArray(rr.selected_headlines)
          ? (rr.selected_headlines as unknown[]).filter((x) => typeof x === "string") as string[]
          : undefined,
        suggestions_json: rr.suggestions_json,
        feedback_text: asString(rr.feedback_text),
        direction_tags: Array.isArray(rr.direction_tags)
          ? (rr.direction_tags as unknown[]).filter((x) => typeof x === "string") as string[]
          : undefined,
      };
      // Always populate derived headlines for display.
      parsed.selected_headlines = deriveSelectedHeadlines(parsed);
      return parsed;
    });

  return {
    profile_id: asString(session.profile_id),
    session_id: asString(session.id),
    genre: asString(session.genre),
    rounds,
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  return { error: text || `HTTP ${res.status}` };
}

function formatNlDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString("nl-NL");
  } catch {
    return dateString;
  }
}

export default function CreatorQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const pendingCount = useMemo(() => items.filter((i) => i.status === "pending").length, [items]);

  const grouped = useMemo(() => {
    const pending = items.filter((i) => i.status === "pending");
    const approved = items.filter((i) => i.status === "approved");
    const rejected = items.filter((i) => i.status === "rejected");
    const other = items.filter((i) => i.status !== "pending" && i.status !== "approved" && i.status !== "rejected");
    return { pending, approved, rejected, other };
  }, [items]);

  function statusLabel(status: string): string {
    switch (status) {
      case "pending":
        return "Pending";
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  }

  function statusClass(status: string): string {
    switch (status) {
      case "pending":
        return "ftm-status ftm-status-pending";
      case "approved":
        return "ftm-status ftm-status-approved";
      case "rejected":
        return "ftm-status ftm-status-rejected";
      default:
        return "ftm-status";
    }
  }

  async function loadQueue() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/creator/queue");
      const json = await readJson(res);
      const err = typeof json.error === "string" ? json.error : "";
      if (!res.ok) {
        setError(err || "Kon creator queue niet laden.");
        setItems([]);
        return;
      }
      const list = Array.isArray(json.items) ? (json.items as QueueItem[]) : [];
      setItems(list);
      setNotesDraft((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (next[item.id] === undefined) next[item.id] = item.review_notes ?? "";
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  async function updateNotes(id: string, notes: string) {
    setBusy((prev) => ({ ...prev, [id]: true }));
    try {
      const form = new FormData();
      form.set("notes", notes);
      const res = await fetch(`/api/creator/queue/${id}/update-notes`, { method: "POST", body: form });
      const json = await readJson(res);
      const err = typeof json.error === "string" ? json.error : "";
      if (!res.ok) throw new Error(err || "Opslaan mislukt.");
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, review_notes: notes } : it)));
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function decide(id: string, action: "approve" | "reject") {
    const notes = notesDraft[id] ?? "";
    setBusy((prev) => ({ ...prev, [id]: true }));
    try {
      const form = new FormData();
      form.set("notes", notes);
      const res = await fetch(`/api/creator/queue/${id}/${action}`, { method: "POST", body: form });
      const json = await readJson(res);
      const err = typeof json.error === "string" ? json.error : "";
      if (!res.ok) throw new Error(err || "Actie mislukt.");
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout.");
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <main className="ftm-coach-shell">
      <section className="ftm-coach-hero" aria-hidden>
        <div className="ftm-coach-hero-inner">
          <img
            src="/brand/ftm-logo-standard-black.svg"
            alt="Follow the Money"
            className="ftm-coach-logo"
          />
          <p className="ftm-coach-kicker">FTM Koppensneller</p>
          <h1 className="ftm-coach-title">Creator Queue</h1>
          <p className="ftm-coach-copy">
            Beoordeel ingestuurde learnings, lees de sessiefeedback en voeg reviewnotities toe vóór goedkeuren of afwijzen.
          </p>
          <div className="ftm-coach-accent-row">
            <span className="ftm-coach-dot" />
            <span>Governance • Kwaliteit • Promptbeheer</span>
          </div>
        </div>
      </section>

      <section className="ftm-coach-panel">
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <h1 className="ftm-coach-h1">Feedback submissions</h1>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="ftm-coach-btn ftm-coach-btn-dark" href="/creator" style={{ textDecoration: "none" }}>
                Control panel
              </a>
              <a className="ftm-coach-btn ftm-coach-btn-dark" href="/creator/users" style={{ textDecoration: "none" }}>
                Known users
              </a>
              <a className="ftm-coach-btn ftm-coach-btn-dark" href="/creator/usage" style={{ textDecoration: "none" }}>
                Usage dashboard
              </a>
            </div>
          </div>
          <p className="ftm-coach-meta">
            {loading ? "Laden..." : `${items.length} items geladen (${pendingCount} pending).`}
          </p>
          {error && <p className="ftm-coach-meta" style={{ color: "#8a2426" }}>{error}</p>}
          <button className="ftm-coach-btn" type="button" onClick={loadQueue} disabled={loading}>
            Ververs
          </button>
        </div>

        {(
          [
            { key: "pending", title: `Pending (${grouped.pending.length})`, open: true, list: grouped.pending },
            { key: "approved", title: `Approved (${grouped.approved.length})`, open: false, list: grouped.approved },
            { key: "rejected", title: `Rejected (${grouped.rejected.length})`, open: false, list: grouped.rejected },
            { key: "other", title: `Other (${grouped.other.length})`, open: false, list: grouped.other },
          ] as const
        ).map((group) => (
          <details key={group.key} className="ftm-group" open={group.open}>
            <summary className="ftm-group-summary">{group.title}</summary>
            <div className="ftm-group-body">
              {group.list.length === 0 && <p className="ftm-coach-meta">Geen items.</p>}
              {group.list.map((item) => renderItem(item))}
            </div>
          </details>
        ))}
      </section>
    </main>
  );

  function renderItem(item: QueueItem) {
          const payload = parsePayload(item.payload_json);
          const rounds = payload.rounds ?? [];
          const isReviewed = item.status === "approved" || item.status === "rejected";
          const isEditing = Boolean(editing[item.id]) && isReviewed;
          const isBusy = Boolean(busy[item.id]);
          const readOnly = isReviewed && !isEditing;

          return (
            <details key={item.id} className="ftm-item">
              <summary className="ftm-item-summary">
                <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
                <span className="ftm-item-main">
                  {item.user_email ?? "Onbekende user"}{" "}
                  <span className="ftm-item-sub">({formatNlDate(item.created_at)})</span>
                </span>
                <span className="ftm-item-id">{item.id}</span>
              </summary>

              <div className="ftm-item-body">
                <p className="ftm-coach-meta">ID: {item.id}</p>
                <p className="ftm-coach-meta">User: {item.user_email ?? "-"}</p>
                <p className="ftm-coach-meta">
                  Sessie: {payload.session_id ?? "-"} | Profiel: {payload.profile_id ?? "-"} | Genre: {payload.genre ?? "-"}
                </p>

              <div style={{ display: "grid", gap: 10 }}>
                {rounds.length === 0 && <p className="ftm-coach-meta">Geen rondegegevens gevonden in payload.</p>}
                {rounds.map((round, idx) => (
                  <details
                    key={`${item.id}-round-${idx}`}
                    style={{ borderTop: "1px solid #d8d1c4", paddingTop: 10 }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                      Ronde {round.round_number ?? idx + 1}
                    </summary>
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      <p className="ftm-coach-meta">
                        Geselecteerde indices: {(round.selected_indices ?? []).join(", ") || "-"}
                      </p>
                      <p className="ftm-coach-meta">
                        Geselecteerde koppen: {(round.selected_headlines ?? []).join(" | ") || "-"}
                      </p>
                      <p className="ftm-coach-meta">Feedback: {round.feedback_text || "-"}</p>
                      <p className="ftm-coach-meta">
                        Richting-tags: {(round.direction_tags ?? []).join(", ") || "-"}
                      </p>
                    </div>
                  </details>
                ))}
              </div>

              <label className="ftm-coach-label" htmlFor={`${item.id}-notes`}>Jouw reviewnotities</label>
              <textarea
                id={`${item.id}-notes`}
                name="notes"
                className="ftm-coach-textarea"
                rows={5}
                value={notesDraft[item.id] ?? ""}
                readOnly={readOnly}
                onChange={(e) => setNotesDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                style={readOnly ? { opacity: 0.75, background: "#f2efe9" } : undefined}
                placeholder="Waarom wel/niet opnemen in volgende promptversie?"
              />

              {isReviewed ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!isEditing ? (
                    <button
                      className="ftm-coach-btn ftm-coach-btn-dark"
                      type="button"
                      disabled={isBusy}
                      onClick={() => setEditing((prev) => ({ ...prev, [item.id]: true }))}
                    >
                      Edit reviewnotitie
                    </button>
                  ) : (
                    <>
                      <button
                        className="ftm-coach-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          await updateNotes(item.id, notesDraft[item.id] ?? "");
                          setEditing((prev) => ({ ...prev, [item.id]: false }));
                        }}
                      >
                        Opslaan
                      </button>
                      <button
                        className="ftm-coach-btn ftm-coach-btn-dark"
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setNotesDraft((prev) => ({ ...prev, [item.id]: item.review_notes ?? "" }));
                          setEditing((prev) => ({ ...prev, [item.id]: false }));
                        }}
                      >
                        Annuleren
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ftm-coach-btn" type="button" disabled={isBusy} onClick={() => decide(item.id, "approve")}>
                    Approve
                  </button>
                  <button className="ftm-coach-btn ftm-coach-btn-dark" type="button" disabled={isBusy} onClick={() => decide(item.id, "reject")}>
                    Reject
                  </button>
                </div>
              )}
              </div>
            </details>
          );
  }
}
