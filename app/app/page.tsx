"use client";

import { useEffect, useState } from "react";
import { Suggestion } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SessionState = {
  sessionId: string;
  roundNumber: number;
  suggestions: Suggestion[];
};

type RoundState = {
  roundNumber: number;
  suggestions: Suggestion[];
  selectedIndices: number[];
  feedbackText: string;
};

type AppCopy = {
  title: string;
  description: string;
  inputs_title: string;
  inputs: string[];
  future_note: string;
  verification_title: string;
  verification_copy: string;
  start_session_button: string;
  next_round_button: string;
};

const MAX_MD_UPLOAD_BYTES = 512 * 1024;

function draftKind(name: string): "md" | "unknown" {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".md")) return "md";
  return "unknown";
}

const fallbackAppCopy: AppCopy = {
  title: "FTM Koppensneller",
  description: "Deze tool genereert iteratief headline-opties voor je concept op basis van redactionele richtlijnen en historische voorbeelden.",
  inputs_title: "Hoe dit werkt",
  inputs: [
    "We hebben een uitgebreide LLM-superprompt gebouwd om koppen te maken die passen bij Follow the Money. Die superprompt is samengesteld op basis van richtlijnen en historische patronen.",
    "",
    "Gebruikte bronnen:",
    "[FTM-stijlgids (compact)](/docs/ftm-stijlgids-condensed)",
    "[Comite Cliche Weg Ermee](/docs/comite-cliche-weg-ermee)",
    "[FTM koppenchecklist](/docs/ftm-koppenchecklist)",
    "historische koppen: patronen + 20 representatieve voorbeelden (samenvatting)",
    "goedgekeurde gebruikersfeedback (lessons) om veelgemaakte fouten te vermijden",
    "",
    "Jij uploadt nu je concept (liefst .md uit Google Docs, of .docx) en kiest het genre. Daarna genereren we meerdere kop-opties in verschillende richtingen. Met jouw feedback sturen we elke volgende ronde bij.",
  ],
  future_note: "Geef vooral feedback op de gegenereerde koppen; die feedback gebruiken we om de richtlijnen en prompt stap voor stap te verbeteren.",
  verification_title: "Verifieer je FTM e-mailadres",
  verification_copy: "Je bent ingelogd met een extern account. Verifieer nu je FTM mailbox om de tool te gebruiken.",
  start_session_button: "Start sessie",
  next_round_button: "Nieuwe ronde",
};

async function readResponsePayload(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  return { error: text || `HTTP ${res.status}` };
}

function renderMaybeLink(text: string): React.ReactNode {
  const m = text.match(/^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
  if (!m) return text;
  const label = m[1];
  const href = m[2];
  return (
    <a href={href} style={{ color: "#0b3b7a", fontWeight: 800 }}>
      {label}
    </a>
  );
}

export default function AppPage() {
  const [genre, setGenre] = useState("nieuws");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("");
  const [rounds, setRounds] = useState<RoundState[]>([]);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [requiresFtmVerification, setRequiresFtmVerification] = useState(false);
  const [ftmEmail, setFtmEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationMsg, setVerificationMsg] = useState("");
  const [loadingVerification, setLoadingVerification] = useState(true);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isGeneratingNextRound, setIsGeneratingNextRound] = useState(false);
  const [copy, setCopy] = useState<AppCopy>(fallbackAppCopy);
  const [introHtml, setIntroHtml] = useState<string>("");
  const [isCreatorUser, setIsCreatorUser] = useState(false);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    let active = true;
    async function loadVerificationState() {
      const res = await fetch("/api/auth/ftm/status");
      const json = await res.json();
      if (!active) return;
      if (res.ok) {
        setRequiresFtmVerification(Boolean(json.requires_ftm_verification));
        if (json.status?.pending_ftm_email) setFtmEmail(json.status.pending_ftm_email);
        const meRes = await fetch("/api/auth/me");
        const meJson = await meRes.json().catch(() => ({}));
        if (meRes.ok) setIsCreatorUser(Boolean(meJson?.is_creator));
      } else {
        setVerificationMsg(json.error || "Kon verificatiestatus niet ophalen.");
      }
      setLoadingVerification(false);
    }
    void loadVerificationState();
    void (async () => {
      const res = await fetch("/api/ui-copy");
      const json = await res.json().catch(() => ({}));
      const appCopy = json?.copy?.app;
      if (!active || !appCopy) return;
      setCopy({
        title: String(appCopy.title || fallbackAppCopy.title),
        description: String(appCopy.description || fallbackAppCopy.description),
        inputs_title: String(appCopy.inputs_title || fallbackAppCopy.inputs_title),
        inputs: Array.isArray(appCopy.inputs) ? appCopy.inputs.map(String) : fallbackAppCopy.inputs,
        future_note: String(appCopy.future_note || fallbackAppCopy.future_note),
        verification_title: String(appCopy.verification_title || fallbackAppCopy.verification_title),
        verification_copy: String(appCopy.verification_copy || fallbackAppCopy.verification_copy),
        start_session_button: String(appCopy.start_session_button || fallbackAppCopy.start_session_button),
        next_round_button: String(appCopy.next_round_button || fallbackAppCopy.next_round_button),
      });
    })();
    void (async () => {
      const res = await fetch("/api/page-copy?slug=app&format=html");
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      if (res.ok && typeof json?.html === "string") setIntroHtml(json.html);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function sendVerificationCode() {
    if (!ftmEmail) return setVerificationMsg("Vul je FTM e-mailadres in.");
    setVerificationMsg("Code wordt verstuurd...");
    const res = await fetch("/api/auth/ftm/start-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ftm_email: ftmEmail }),
    });
    const json = await res.json();
    if (!res.ok) return setVerificationMsg(json.error || "Versturen mislukt.");
    setVerificationMsg("Verificatiecode verstuurd. Controleer je FTM mailbox.");
  }

  async function submitVerificationCode() {
    if (!verificationCode) return setVerificationMsg("Vul de 6-cijferige code in.");
    setVerificationMsg("Code controleren...");
    const res = await fetch("/api/auth/ftm/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: verificationCode }),
    });
    const json = await res.json();
    if (!res.ok) return setVerificationMsg(json.error || "Code verificatie mislukt.");
    setRequiresFtmVerification(false);
    setVerificationMsg("FTM e-mailadres succesvol geverifieerd.");
    setVerificationCode("");
  }

  async function startSession() {
    if (!draftFile) return setStatus("Selecteer eerst een .md-bestand.");
    {
      const kind = draftKind(draftFile.name);
      const limit = MAX_MD_UPLOAD_BYTES;
      if (draftFile.size > limit) {
        const mb = (draftFile.size / (1024 * 1024)).toFixed(1);
        const maxMb = (limit / (1024 * 1024)).toFixed(1);
        return setStatus(
          `Bestand is te groot (${mb} MB). Maximaal ${maxMb} MB voor .md. Tip: verwijder embeds en probeer opnieuw.`,
        );
      }
    }
    try {
      setIsStartingSession(true);
      const form = new FormData();
      form.append("draft", draftFile);
      form.append("genre", genre);
      setStatus("Genereren...");
      const res = await fetch("/api/sessions", { method: "POST", body: form });
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : "Onbekende fout.";
      if (res.status === 413) {
        return setStatus(
          "Upload te groot voor de server. Maak je .docx kleiner (verwijder afbeeldingen) en probeer opnieuw.",
        );
      }
      if (res.status === 403 && error === "FORBIDDEN_FTM_NOT_VERIFIED") {
        setRequiresFtmVerification(true);
        return setStatus("Verifieer eerst je FTM e-mailadres.");
      }
      if (!res.ok) return setStatus(error);
      setSession({
        sessionId: String(payload.session_id),
        roundNumber: Number(payload.round_number),
        suggestions: (payload.suggestions as Suggestion[]) ?? [],
      });
      const firstRoundNumber = Number(payload.round_number);
      setRounds([
        {
          roundNumber: firstRoundNumber,
          suggestions: (payload.suggestions as Suggestion[]) ?? [],
          selectedIndices: [],
          feedbackText: "",
        },
      ]);
      setActiveRoundNumber(firstRoundNumber);
      setSelected([]);
      await submitLearnings(String(payload.session_id), true);
      setStatus("Ronde 1 klaar.");
    } catch (err) {
      setStatus(`Fout bij starten sessie: ${err instanceof Error ? err.message : "onbekende fout"}`);
    } finally {
      setIsStartingSession(false);
    }
  }

  async function nextRound() {
    if (!session) return;
    try {
      setIsGeneratingNextRound(true);
      setStatus("Begrepen. Nieuwe koppen worden gegenereerd...");
      const selectedSnapshot = [...selected];
      const feedbackSnapshot = feedback;
      const res = await fetch(
        `/api/sessions/${session.sessionId}/rounds/${session.roundNumber + 1}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_indices: selected,
            feedback_text: feedback,
            user_revision_text: "",
          }),
        },
      );
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : "Onbekende fout.";
      if (res.status === 403 && error === "FORBIDDEN_FTM_NOT_VERIFIED") {
        setRequiresFtmVerification(true);
        return setStatus("Verifieer eerst je FTM e-mailadres.");
      }
      if (!res.ok) return setStatus(error);
      const newRoundNumber = Number(payload.round_number);
      const newSuggestions = (payload.suggestions as Suggestion[]) ?? [];
      setRounds((prev) => {
        const updatedPrev = prev.map((round) =>
          round.roundNumber === session.roundNumber
            ? { ...round, selectedIndices: selectedSnapshot, feedbackText: feedbackSnapshot }
            : round,
        );
        return [
          ...updatedPrev,
          {
            roundNumber: newRoundNumber,
            suggestions: newSuggestions,
            selectedIndices: [],
            feedbackText: "",
          },
        ];
      });
      setActiveRoundNumber(newRoundNumber);
      setSession({
        sessionId: session.sessionId,
        roundNumber: newRoundNumber,
        suggestions: newSuggestions,
      });
      setSelected([]);
      setFeedback("");
      await submitLearnings(session.sessionId, true);
      setStatus(`Ronde ${String(payload.round_number)} klaar.`);
    } catch (err) {
      setStatus(`Fout bij volgende ronde: ${err instanceof Error ? err.message : "onbekende fout"}`);
    } finally {
      setIsGeneratingNextRound(false);
    }
  }

  const activeRound = rounds.find((r) => r.roundNumber === activeRoundNumber) ?? null;
  const isViewingLatestRound = !session || !activeRound ? false : activeRound.roundNumber === session.roundNumber;

  async function submitLearnings(sessionIdArg?: string, silent = false) {
    const targetSessionId = sessionIdArg || session?.sessionId;
    if (!targetSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${targetSessionId}/submit-feedback`, {
        method: "POST",
      });
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : "Kon niet indienen.";
      if (!res.ok && !silent) return setStatus(error);
      if (!res.ok) return;
      if (!silent) setStatus("Learnings automatisch ingediend voor review.");
    } catch (err) {
      if (!silent) {
        setStatus(`Fout bij indienen: ${err instanceof Error ? err.message : "onbekende fout"}`);
      }
    }
  }

  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
      {loadingVerification && <div className="ftm-coach-card">Verificatiestatus laden...</div>}
      {!loadingVerification && requiresFtmVerification && (
        <div className="ftm-coach-card">
          <h2 className="ftm-coach-h2">{copy.verification_title}</h2>
          <p>{copy.verification_copy}</p>
          <label className="ftm-coach-label">FTM e-mailadres</label>
          <input
            className="ftm-coach-input"
            type="email"
            value={ftmEmail}
            onChange={(e) => setFtmEmail(e.target.value)}
            placeholder="naam@ftm.nl"
          />
          <button className="ftm-coach-btn" onClick={sendVerificationCode}>Stuur code</button>
          <label className="ftm-coach-label">Verificatiecode (6 cijfers)</label>
          <input
            className="ftm-coach-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
          />
          <button className="ftm-coach-btn" onClick={submitVerificationCode}>Verifieer code</button>
          {verificationMsg && <p className="ftm-coach-meta">{verificationMsg}</p>}
        </div>
      )}

      {!requiresFtmVerification && (
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <div className="ftm-coach-row" style={{ gap: 14 }}>
              <img
                src="/brand/ftm-logo-standard-black.svg"
                alt="Follow the Money"
                style={{ height: 20, width: "auto", display: "block" }}
              />
              <h1 className="ftm-coach-h1" style={{ margin: 0 }}>
                {copy.title}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {isCreatorUser && (
                <a
                  href="/creator/queue"
                  className="ftm-coach-btn ftm-coach-btn-dark"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Creator Queue
                </a>
              )}
              <button className="ftm-coach-btn ftm-coach-btn-dark" type="button" onClick={logout}>Uitloggen</button>
            </div>
          </div>
          {introHtml ? (
            <div className="ftm-doc-prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
          ) : (
            <>
              <p className="ftm-coach-meta">{copy.description}</p>
              <div>
                <strong>{copy.inputs_title}</strong>
                <ul className="ftm-coach-list">
                  {copy.inputs.map((item, i) => (
                    <li key={`${i}-${item}`}>{renderMaybeLink(item)}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <p className="ftm-coach-meta">{copy.future_note}</p>
          <label className="ftm-coach-label">Genre</label>
          <select className="ftm-coach-select" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="nieuws">nieuws</option>
            <option value="onderzoek">onderzoek</option>
            <option value="analyse">analyse</option>
            <option value="feature">feature</option>
            <option value="interview">interview</option>
            <option value="podcast">podcast</option>
            <option value="essay">essay</option>
          </select>
          <label className="ftm-coach-label">Concept (.md)</label>
          <input
            className="ftm-coach-input"
            type="file"
            accept=".md"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setDraftFile(f);
              if (!f) return;
              const kind = draftKind(f.name);
              if (kind === "unknown") {
                setStatus("Alleen .md is toegestaan.");
                return;
              }
              if (f.size > MAX_MD_UPLOAD_BYTES) {
                const mb = (f.size / (1024 * 1024)).toFixed(1);
                const maxMb = (MAX_MD_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
                setStatus(`Bestand is te groot (${mb} MB). Maximaal ${maxMb} MB voor .md.`);
                return;
              }
              setStatus("");
            }}
          />
          <p className="ftm-coach-meta">
            Tip (Google Docs): <span style={{ fontWeight: 600 }}>File</span> → <span style={{ fontWeight: 600 }}>Download</span> →{" "}
            <span style={{ fontWeight: 600 }}>Markdown (.md)</span>. Upload daarna die .md hier.
          </p>
          {!session && (
            <button className="ftm-coach-btn" onClick={startSession} disabled={isStartingSession}>
              {isStartingSession ? "Bezig met genereren..." : copy.start_session_button}
            </button>
          )}
          <p className="ftm-coach-meta">{status}</p>
        </div>
      )}

      {!requiresFtmVerification && session && (
        <div className="ftm-coach-card">
          <div className="ftm-round-header">
            <h2 className="ftm-coach-h2" style={{ margin: 0 }}>
              Ronde {activeRound?.roundNumber ?? session.roundNumber}
            </h2>
            <div className="ftm-round-pills">
              {rounds.map((round) => (
                <button
                  key={`pill-${round.roundNumber}`}
                  type="button"
                  className={`ftm-round-pill ${round.roundNumber === activeRound?.roundNumber ? "is-active" : ""}`}
                  onClick={() => setActiveRoundNumber(round.roundNumber)}
                >
                  {round.roundNumber}
                </button>
              ))}
            </div>
          </div>

          {!isViewingLatestRound && (
            <p className="ftm-coach-meta">
              Bekijkmodus: je kijkt naar een eerdere ronde. Selecteer de laatste ronde om verder te itereren.
            </p>
          )}

          {(activeRound?.suggestions ?? session.suggestions).map((s, i) => (
            <label key={`${session.roundNumber}-${i}`} className="ftm-coach-suggestion">
              <input
                type="checkbox"
                checked={selected.includes(i)}
                disabled={!isViewingLatestRound || isGeneratingNextRound}
                onChange={(e) => {
                  setSelected((prev) =>
                    e.target.checked ? [...prev, i] : prev.filter((v) => v !== i),
                  );
                }}
              />
              <span>[{i}] {s.headline}</span>
            </label>
          ))}
          <label className="ftm-coach-label">Feedback</label>
          <textarea
            className="ftm-coach-textarea"
            rows={4}
            value={feedback}
            disabled={!isViewingLatestRound || isGeneratingNextRound}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Bijv. korter, scherper, juridisch voorzichtiger"
          />
          <button
            className="ftm-coach-btn"
            onClick={nextRound}
            disabled={isGeneratingNextRound || !isViewingLatestRound}
          >
            {isGeneratingNextRound ? "Nieuwe koppen worden gegenereerd..." : copy.next_round_button}
          </button>
          {isGeneratingNextRound && (
            <p className="ftm-coach-meta">Even geduld: we werken aan een nieuwe ronde met aangepaste koppen.</p>
          )}

          {rounds.length > 1 && (
            <details className="ftm-round-history">
              <summary>Bekijk feedback uit eerdere rondes</summary>
              <div className="ftm-round-history-body">
                {rounds
                  .filter((round) => round.roundNumber < (session?.roundNumber ?? 0))
                  .map((round) => (
                    <div key={`history-${round.roundNumber}`} className="ftm-round-history-item">
                      <strong>Ronde {round.roundNumber}</strong>
                      <p className="ftm-coach-meta">
                        Geselecteerde indices: {round.selectedIndices.join(", ") || "-"}
                      </p>
                      <p className="ftm-coach-meta">Feedback: {round.feedbackText || "-"}</p>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}
      </section>
    </main>
  );
}
